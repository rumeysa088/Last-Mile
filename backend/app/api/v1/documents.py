from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.tenant import get_current_tenant
from app.db.session import get_db
from app.models.models import Case, Document, User
from app.schemas.documents import DocumentResponse
from app.services.audit import log_action
from app.api.v1.cases import verify_case_access

router = APIRouter(prefix="/cases", tags=["Documents"])

STORAGE_DIR = Path(__file__).resolve().parents[3] / "storage" / "documents"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}


def detect_valid_file_type(content: bytes) -> str | None:
    """Verify file type through magic bytes/signatures."""
    if content.startswith(b"%PDF"):
        return "application/pdf"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    return None


def get_authorized_case(
    db: Session,
    case_id: UUID,
    tenant_id: UUID,
    user: User,
    required_scope: str = "read_only",
) -> Case:
    case = db.query(Case).filter(
        Case.id == case_id,
        Case.tenant_id == tenant_id,
    ).first()

    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found",
        )

    verify_case_access(db, case, user, required_scope=required_scope)
    return case


@router.post(
    "/{case_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    case_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    case = get_authorized_case(db, case_id, tenant_id, current_user, required_scope="read_write")

    content = await file.read(MAX_FILE_SIZE + 1)

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit",
        )

    detected_type = detect_valid_file_type(content)
    if not detected_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File content does not match allowed types (PDF, JPEG, PNG)",
        )

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename or "upload").name
    storage_key = f"{uuid4().hex}_{safe_name}"
    file_path = STORAGE_DIR / storage_key

    try:
        file_path.write_bytes(content)

        document = Document(
            case_id=case.id,
            uploaded_by=current_user.id,
            filename=safe_name,
            content_type=detected_type,
            storage_key=storage_key,
        )

        db.add(document)
        db.flush()

        log_action(
            db=db,
            actor_id=current_user.id,
            action="document.uploaded",
            entity_type="document",
            entity_id=document.id,
            details={"case_id": str(case.id), "filename": safe_name},
        )

        db.commit()
        db.refresh(document)
        return document

    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise

    finally:
        await file.close()


@router.get(
    "/{case_id}/documents",
    response_model=list[DocumentResponse],
)
def list_documents(
    case_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    case = get_authorized_case(db, case_id, tenant_id, current_user)

    return db.query(Document).filter(
        Document.case_id == case.id
    ).order_by(Document.created_at.desc()).all()


@router.get("/{case_id}/documents/{document_id}/download")
def download_document(
    case_id: UUID,
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    case = get_authorized_case(db, case_id, tenant_id, current_user)

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.case_id == case.id,
    ).first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    file_path = STORAGE_DIR / document.storage_key

    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored file not found",
        )

    log_action(
        db=db,
        actor_id=current_user.id,
        action="document.downloaded",
        entity_type="document",
        entity_id=document.id,
        details={"case_id": str(case.id), "filename": document.filename},
    )
    db.commit()

    return FileResponse(
        path=file_path,
        media_type=document.content_type or "application/octet-stream",
        filename=document.filename,
    )
