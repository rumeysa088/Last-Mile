// Spoken Urdu, written in Devanagari, for phones that have no Urdu voice.
// Most Android phones and Windows PCs ship a Hindi voice but no Urdu one. Spoken Urdu and
// Hindi are the same language at this level, so the Hindi voice reads these lines aloud.
// The SCREEN always stays in Urdu script; this file is only fed to the voice.
// Vocabulary is kept Urdu (shanakhti card, darkhwast, ijazat), not Sanskritised Hindi.
// Keys mirror ur.ts. Placeholders like {name} must match ur.ts exactly.
import type { Dict } from './en'

export const urSpoken: Partial<Dict> = {
  hello: 'अस्सलाम अलैकुम, {name}',
  what_to_do: 'आप क्या करना चाहते हैं?',
  tile_apply: 'मदद की दरख़्वास्त दें',
  tile_track: 'मेरी दरख़्वास्तें',
  tile_scam: 'क्या ये पैग़ाम सच्चा है?',
  tile_consent: 'मेरा डेटा कौन देख सकता है',
  home_title_full: 'जो मदद आपका हक़ है, वो लें।',

  q_name: 'आपका पूरा नाम क्या है?',
  q_name_hint: 'जैसा शनाख़्ती कार्ड पर लिखा है।',
  q_cnic: 'आपका शनाख़्ती कार्ड नंबर क्या है?',
  q_cnic_hint: 'कार्ड पर तेरह हिंदसे। नमूने के लिए कोई भी फ़र्ज़ी नंबर लिखें।',
  q_phone: 'आपका मोबाइल नंबर क्या है?',
  q_phone_hint: 'ज़ीरो थ्री से शुरू होता है। इत्तिला इसी पर आएगी।',
  q_district: 'आप कहाँ रहते हैं?',
  q_household: 'आपके घर में कितने लोग रहते हैं?',
  q_household_hint: 'अपने आप और बच्चों को भी गिनें।',
  q_situation: 'क्या इनमें से कोई बात आपके घर पर लागू है?',
  sit_widow: 'घर की सरबराह बेवा हैं',
  sit_disability: 'कोई माज़ूर है',
  sit_elderly: 'सरबराह की उम्र साठ से ज़्यादा है',
  sit_none: 'इनमें से कोई नहीं',
  q_income: 'आपके घर की महीने की कमाई कितनी है?',
  q_income_hint: 'घर के सब लोगों की मिला कर।',
  band_lt_20k: 'बीस हज़ार रुपये से कम',
  band_20k_35k: 'बीस से पैंतीस हज़ार रुपये',
  band_35k_50k: 'पैंतीस से पचास हज़ार रुपये',
  band_gt_50k: 'पचास हज़ार रुपये से ज़्यादा',
  exact_income: 'मुझे पूरी रक़म मालूम है',
  q_photo: 'शनाख़्ती कार्ड की तस्वीर लें',
  q_photo_hint: 'अभी छोड़ कर बाद में भी दे सकते हैं। तस्वीर इस फ़ोन में महफ़ूज़ नहीं होती।',
  review_title: 'अपने जवाब देख लें',
  review_hint: 'कुछ ग़लत हो तो "बदलें" दबाएँ।',
  sent_title: 'दरख़्वास्त भेज दी गई',
  sent_ref: 'आपका हवाला नंबर',
  queued_title: 'इस फ़ोन में महफ़ूज़ है',
  queued_body: 'सिग्नल आते ही ख़ुद भेज दी जाएगी। आप ऐप बंद कर सकते हैं।',
  choose_one: 'इनमें से एक चुनें',

  voice_heard: 'क्या आपने ये कहा',
  voice_listening: 'सुन रहे हैं। अब बोलें।',

  scam_title: 'क्या ये पैग़ाम सच्चा है?',
  scam_intro: 'जो पैग़ाम आया है उसे यहाँ चिपकाएँ, लिखें या बोलें। हम ख़तरे की निशानियाँ देखते हैं।',
  verdict_suspicious: 'ये धोखा लगता है',
  verdict_likely_legitimate: 'ख़तरे की कोई निशानी नहीं मिली',
  verdict_unknown: 'हमें यक़ीन नहीं',
  scam_steps: 'अब क्या करें',
  scam_never_guarantee: 'हम कभी वादा नहीं कर सकते कि पैग़ाम सच्चा है। कुछ करने से पहले अपनी जानी पहचानी सरकारी हेल्पलाइन या वेबसाइट से पूछें।',

  consent_title: 'मेरा डेटा कौन देख सकता है',
  consent_intro: 'आप फ़ैसला करते हैं कि आपकी मालूमात कौन देखे। आप जब चाहें रोक सकते हैं।',
  consent_stop_confirm: '{name} आपका डेटा न देख सकेंगे न बदल सकेंगे। जो दरख़्वास्तें जा चुकी हैं वो महकमे के पास रहेंगी।',
  consent_script: 'मैं {helper} हूँ, कम्युनिटी मददगार। क्या मैं इमदाद की दरख़्वास्त में मदद के लिए आपका नाम, शनाख़्ती कार्ड, फ़ोन, ख़ानदान और आमदनी देख सकती हूँ? आप अपने फ़ोन से किसी भी वक़्त ये रोक सकते हैं।',
  consent_ask_family: 'इजाज़त सिर्फ़ ख़ानदान दे सकता है। {name} से कहें कि अपने फ़ोन पर लास्ट माइल खोल कर "दोबारा शेयर करें" दबाएँ, या इमदादी अफ़सर से दर्ज करवाएँ।',

  track_title: 'मेरी दरख़्वास्तें',
  status_submitted: 'भेज दी गई, अफ़सर का इंतज़ार',
  status_under_review: 'अफ़सर जाँच रहे हैं',
  status_needs_information: 'मज़ीद सबूत चाहिए',
  status_approved: 'मंज़ूर',
  status_rejected: 'मंज़ूर नहीं हुई',
  status_closed: 'बंद',
  missing_title: 'अभी क्या बाक़ी है',
  missing_cnic_photo: 'शनाख़्ती कार्ड की तस्वीर',
  missing_exact_monthly_income: 'महीने की पूरी आमदनी',
  computer_never_approves: 'कंप्यूटर ख़ुद कभी मंज़ूरी नहीं देता। हर आख़िरी फ़ैसला अफ़सर करता है।',
}
