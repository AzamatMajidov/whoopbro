export type Lang = 'uz' | 'ru';

export const t = (lang: Lang, key: keyof typeof strings.uz, ...args: string[]): string => {
  const str = strings[lang]?.[key] ?? strings.uz[key];
  return args.reduce((s, arg, i) => s.replace(`{${i}}`, arg), str);
};

const strings = {
  uz: {
    // Start
    already_connected: "Whoop hisobingiz allaqachon ulangan \u2705\n\nSozlamalar uchun /settings, holatni ko'rish uchun /status",
    welcome: "\uD83C\uDFCB\uFE0F WhoopBro ga xush kelibsiz!\n\nHar kuni ertalab Whoop ma'lumotlaringiz asosida shaxsiy sog'liq tavsiyalari olasiz \u2014 o'zbek tilida.\n\nBoshlash uchun Whoop hisobingizni ulang \uD83D\uDC47",
    connect_button: '\uD83D\uDD17 Whoop Hisobimni Ulash',

    // OAuth
    oauth_connecting: "\u23F3 Birinchi hisobotingiz tayyorlanmoqda...",
    oauth_success_brief: "\u2705 Whoop muvaffaqiyatli ulandi! Hisobotingiz tayyorlanmoqda \uD83D\uDD04",

    // Settings
    settings_title: '\u2699\uFE0F Sozlamalar',
    settings_brief_time: 'Hisobot vaqti',
    settings_language: 'Til',
    settings_subscription: 'Obuna',
    settings_whoop: 'Whoop',
    settings_connected: 'Ulangan \u2705',
    settings_disconnected: 'Ulanmagan \u274C',
    btn_change_time: "\u23F0 Vaqtni o'zgartirish",
    btn_language: '\uD83C\uDF10 Til',
    btn_disconnect_whoop: '\uD83D\uDD0C Whoop uzish',
    btn_subscribe: "\uD83D\uDCB3 Obuna bo'lish",

    // Language
    lang_uz: "\uD83C\uDDFA\uD83C\uDDFF O'zbek",
    lang_ru: '\uD83C\uDDF7\uD83C\uDDFA \u0420\u0443\u0441\u0441\u043A\u0438\u0439',
    lang_changed_uz: "\u2705 Til o'zgartirildi: O'zbek tili",
    lang_changed_ru: '\u2705 \u042F\u0437\u044B\u043A \u0438\u0437\u043C\u0435\u043D\u0451\u043D: \u0420\u0443\u0441\u0441\u043A\u0438\u0439',
    lang_prompt: 'Tilni tanlang:',

    // Brief time
    time_prompt: "\u23F0 Yangi hisobot vaqtini HH:MM formatida yuboring (masalan: 07:30)\nVaqt 05:30\u201322:00 oralig'ida bo'lishi kerak.",
    time_invalid_format: "Noto'g'ri format. HH:MM formatida yuboring (masalan: 07:30).",
    time_out_of_range: "Vaqt 05:30\u201322:00 oralig'ida bo'lishi kerak.",
    time_saved: '\u2705 Endi har kuni soat {0} da hisobot olasiz.',

    // Status
    status_title: '\uD83D\uDCCA Holat',
    status_last_brief: 'Oxirgi hisobot',
    status_brief_time: 'Hisobot vaqti',
    status_not_sent: 'Hali yuborilmagan',
    sub_trial: 'Sinov davri ({0} kun qoldi)',
    sub_active: 'Faol ({0} kun qoldi)',
    sub_expired: "Muddati o'tgan",
    sub_none: "Yo'q",

    // Disconnect
    disconnect_not_connected: "Whoop hisobingiz ulanmagan. Ulash uchun /start yuboring.",
    disconnect_confirm_prompt: "Haqiqatan ham Whoop hisobingizni uzmoqchimisiz?\nBarcha ma'lumotlar o'chiriladi.",
    btn_disconnect_yes: 'Ha, uzish \u26A0\uFE0F',
    btn_cancel: '\u274C Bekor',
    disconnect_done: '\u2705 Whoop hisobi uzildi. Qayta ulash uchun /start yuboring.',
    disconnect_cancelled: 'Bekor qilindi.',

    // Payment
    payment_title: '\uD83D\uDCB3 WhoopBro Pro \u2014 50,000 UZS/oy',
    payment_card_label: 'Karta raqami:',
    payment_instruction: "To'lovni amalga oshirgach, quyidagi tugmani bosing:",
    btn_paid: "\u2705 To'ladim",
    btn_cancel_payment: '\u274C Bekor qilish',
    payment_received: "\u2705 So'rovingiz qabul qilindi!\n\nAdmin tez orada obunangizni faollashtiradi (odatda 1-2 soat ichida). \u23F3",
    payment_cancelled: "Bekor qilindi. Obuna bo'lishni xohlaganingizda /status yuboring.",
    sub_activated: "\uD83C\uDF89 Obunangiz faollashtirildi!\n\n\u2705 30 kun davomida to'liq kirish mavjud.\n\nHisobot har kuni soat {0} da keladi. Savollar uchun /status",
    sub_rejected: "\u274C To'lovingiz tasdiqlanmadi.\n\nMuammo bo'lsa, @azamajidov bilan bog'laning.",

    // Queries
    query_limit: "Bugun savollar limitiga yetdingiz (10/10). Ertaga yana so'rashingiz mumkin. \uD83D\uDE4F",
    query_no_data: "Bugun ma'lumot hali yuklanmagan",
    query_ask_prompt: 'Savolingizni yozing \uD83D\uDC47',
    query_error: "Xatolik yuz berdi. Keyinroq qayta urinib ko'ring. \uD83D\uDE4F",

    // Trial warnings
    trial_warning_2days: "\u23F3 WhoopBro sinovidan 2 kun qoldi.\n\nTo'liq hisobot va AI maslahatdan foydalanishni davom ettirish uchun obuna bo'ling.",
    trial_warning_1day: "\u26A0\uFE0F Ertaga sinoviniz tugaydi!\n\nHisobotlaringiz to'xtatilishini xohlamasangiz, obuna bo'ling.",
    expiry_warning: "\u23F3 Obuna muddatingiz 2 kun ichida tugaydi. Uzilmaslik uchun qayta to'lov qiling.",
    btn_extend_sub: "\uD83D\uDCB3 Obunani uzaytirish",

    // Brief formatter
    brief_stale_notice: "\u26A0\uFE0F Bugungi ma'lumot kelmadi. Kechagi ko'rsatkichlar:",
    brief_recovery_label: 'Tiklanish',
    brief_hrv_label: 'HRV',
    brief_rhr_label: 'Tinch yurak',
    brief_spo2_label: 'SpO\u2082',
    brief_sleep_label: 'Uyqu',
    brief_sleep_efficiency: 'samaradorlik',
    brief_rem_label: 'REM',
    brief_deep_label: 'Chuqur',
    brief_light_label: 'Yengil',
    brief_footer: '\u26A0\uFE0F Bu tibbiy maslahat emas',
    btn_detail: '\uD83D\uDCAA Batafsil',
    btn_ask: '\u2753 Savol berish',
    btn_whynot: '🔍 Nima uchun?',
    no_device_msg: "Bugun Whoop qurilmasi kiyilmagan. Dam oling va ertaga yangi kuch bilan boshlang! \uD83D\uDCAA",
    fallback_high: "Tiklanish yaxshi! Bugun o'rta yoki yuqori intensivlikdagi mashq qilishingiz mumkin.",
    fallback_mid: "Tiklanish o'rtacha. Engil mashq yoki yurish tavsiya etiladi.",
    fallback_low: 'Tiklanish past. Bugun dam olish yoki juda engil harakat qiling.',
    paywall_msg: "To'liq hisobot, uyqu tahlili va AI maslahat uchun obuna bo'ling.\n\n14 kunlik bepul sinov!",
    paywall_no_recovery: "Tiklanish ma'lumoti yo'q",
    btn_subscribe_paywall: "\uD83D\uDCB3 Obuna bo'lish \u2014 50,000 UZS/oy",
    detail_title: "Batafsil ko'rsatkichlar",
    detail_recovery: 'Tiklanish',
    detail_sleep: 'Uyqu',
    detail_strain: "Zo'riqish",
    detail_duration: 'Davomiylik',
    detail_efficiency: 'Samaradorlik',
    detail_effectiveness: 'Effektivlik',
    detail_respiratory: 'Nafas tezligi',
    detail_workouts: 'Mashqlar',
    detail_strain_label: "Zo'riqish balli",
    detail_calories: 'Kaloriya',
    late_notice: "Kechirasiz, ma'lumot kech tayyor bo'ldi \uD83D\uDE4F",
    no_device_detail: 'Bugun qurilma kiyilmagan.',
    soat: 'soat',
    daqiqa: 'daqiqa',
    daq: 'daq',
    urish_min: 'urish/min',
    nafas_min: 'nafas/min',
    kkal: 'kkal',
  },
  ru: {
    // Start
    already_connected: '\u0412\u0430\u0448 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 Whoop \u0443\u0436\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D \u2705\n\n\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: /settings, \u0441\u0442\u0430\u0442\u0443\u0441: /status',
    welcome: '\uD83C\uDFCB\uFE0F \u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 WhoopBro!\n\n\u041A\u0430\u0436\u0434\u043E\u0435 \u0443\u0442\u0440\u043E \u0432\u044B \u0431\u0443\u0434\u0435\u0442\u0435 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u0438 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0434\u0430\u043D\u043D\u044B\u0445 Whoop.\n\n\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 Whoop, \u0447\u0442\u043E\u0431\u044B \u043D\u0430\u0447\u0430\u0442\u044C \uD83D\uDC47',
    connect_button: '\uD83D\uDD17 \u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C Whoop',

    // OAuth
    oauth_connecting: '\u23F3 \u0412\u0430\u0448 \u043F\u0435\u0440\u0432\u044B\u0439 \u043E\u0442\u0447\u0451\u0442 \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F...',
    oauth_success_brief: '\u2705 Whoop \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D! \u0413\u043E\u0442\u043E\u0432\u0438\u043C \u043E\u0442\u0447\u0451\u0442 \uD83D\uDD04',

    // Settings
    settings_title: '\u2699\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438',
    settings_brief_time: '\u0412\u0440\u0435\u043C\u044F \u043E\u0442\u0447\u0451\u0442\u0430',
    settings_language: '\u042F\u0437\u044B\u043A',
    settings_subscription: '\u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430',
    settings_whoop: 'Whoop',
    settings_connected: '\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D \u2705',
    settings_disconnected: '\u041D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D \u274C',
    btn_change_time: '\u23F0 \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0440\u0435\u043C\u044F',
    btn_language: '\uD83C\uDF10 \u042F\u0437\u044B\u043A',
    btn_disconnect_whoop: '\uD83D\uDD0C \u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C Whoop',
    btn_subscribe: '\uD83D\uDCB3 \u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443',

    // Language
    lang_uz: "\uD83C\uDDFA\uD83C\uDDFF O'zbek",
    lang_ru: '\uD83C\uDDF7\uD83C\uDDFA \u0420\u0443\u0441\u0441\u043A\u0438\u0439',
    lang_changed_uz: '\u2705 \u042F\u0437\u044B\u043A \u0438\u0437\u043C\u0435\u043D\u0451\u043D: \u0423\u0437\u0431\u0435\u043A\u0441\u043A\u0438\u0439',
    lang_changed_ru: '\u2705 \u042F\u0437\u044B\u043A \u0438\u0437\u043C\u0435\u043D\u0451\u043D: \u0420\u0443\u0441\u0441\u043A\u0438\u0439',
    lang_prompt: '\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u044F\u0437\u044B\u043A:',

    // Brief time
    time_prompt: '\u23F0 \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u043D\u043E\u0432\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 HH:MM (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: 07:30)\n\u0414\u0438\u0430\u043F\u0430\u0437\u043E\u043D: 05:30\u201322:00',
    time_invalid_format: '\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442. \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 HH:MM (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: 07:30).',
    time_out_of_range: '\u0412\u0440\u0435\u043C\u044F \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0432 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0435 05:30\u201322:00.',
    time_saved: '\u2705 \u0422\u0435\u043F\u0435\u0440\u044C \u043E\u0442\u0447\u0451\u0442 \u0431\u0443\u0434\u0435\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u044C \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u0432 {0}.',

    // Status
    status_title: '\uD83D\uDCCA \u0421\u0442\u0430\u0442\u0443\u0441',
    status_last_brief: '\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u043E\u0442\u0447\u0451\u0442',
    status_brief_time: '\u0412\u0440\u0435\u043C\u044F \u043E\u0442\u0447\u0451\u0442\u0430',
    status_not_sent: '\u0415\u0449\u0451 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u043B\u0441\u044F',
    sub_trial: '\u041F\u0440\u043E\u0431\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 (\u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C {0} \u0434\u043D.)',
    sub_active: '\u0410\u043A\u0442\u0438\u0432\u043D\u0430 (\u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C {0} \u0434\u043D.)',
    sub_expired: '\u0418\u0441\u0442\u0435\u043A\u043B\u0430',
    sub_none: '\u041D\u0435\u0442',

    // Disconnect
    disconnect_not_connected: '\u0412\u0430\u0448 Whoop \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D. \u0414\u043B\u044F \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 /start.',
    disconnect_confirm_prompt: '\u0412\u044B \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C Whoop?\n\u0412\u0441\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0431\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u044B.',
    btn_disconnect_yes: '\u0414\u0430, \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u26A0\uFE0F',
    btn_cancel: '\u274C \u041E\u0442\u043C\u0435\u043D\u0430',
    disconnect_done: '\u2705 Whoop \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D. \u0414\u043B\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0433\u043E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 /start.',
    disconnect_cancelled: '\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E.',

    // Payment
    payment_title: '\uD83D\uDCB3 WhoopBro Pro \u2014 50 000 UZS/\u043C\u0435\u0441',
    payment_card_label: '\u041D\u043E\u043C\u0435\u0440 \u043A\u0430\u0440\u0442\u044B:',
    payment_instruction: '\u041F\u043E\u0441\u043B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435:',
    btn_paid: '\u2705 \u041E\u043F\u043B\u0430\u0442\u0438\u043B',
    btn_cancel_payment: '\u274C \u041E\u0442\u043C\u0435\u043D\u0430',
    payment_received: '\u2705 \u0417\u0430\u044F\u0432\u043A\u0430 \u043F\u0440\u0438\u043D\u044F\u0442\u0430!\n\n\u0410\u0434\u043C\u0438\u043D \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0443\u0435\u0442 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443 \u0432 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043C\u044F (\u043E\u0431\u044B\u0447\u043D\u043E 1-2 \u0447\u0430\u0441\u0430). \u23F3',
    payment_cancelled: '\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E. \u041A\u043E\u0433\u0434\u0430 \u0437\u0430\u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F, \u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 /status.',
    sub_activated: '\uD83C\uDF89 \u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u0430!\n\n\u2705 \u041F\u043E\u043B\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F \u043D\u0430 30 \u0434\u043D\u0435\u0439.\n\n\u041E\u0442\u0447\u0451\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442 \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u0432 {0}. \u0412\u043E\u043F\u0440\u043E\u0441\u044B: /status',
    sub_rejected: '\u274C \u041E\u043F\u043B\u0430\u0442\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430.\n\n\u0415\u0441\u043B\u0438 \u0432\u043E\u0437\u043D\u0438\u043A\u043B\u0438 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u044B, \u0441\u0432\u044F\u0436\u0438\u0442\u0435\u0441\u044C \u0441 @azamajidov.',

    // Queries
    query_limit: '\u0412\u044B \u0434\u043E\u0441\u0442\u0438\u0433\u043B\u0438 \u043B\u0438\u043C\u0438\u0442\u0430 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F (10/10). \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0437\u0430\u0432\u0442\u0440\u0430. \uD83D\uDE4F',
    query_no_data: '\u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u0435\u0449\u0451 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B',
    query_ask_prompt: '\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043E\u043F\u0440\u043E\u0441 \uD83D\uDC47',
    query_error: '\u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435. \uD83D\uDE4F',

    // Trial warnings
    trial_warning_2days: '\u23F3 \u0414\u043E \u043A\u043E\u043D\u0446\u0430 \u043F\u0440\u043E\u0431\u043D\u043E\u0433\u043E \u043F\u0435\u0440\u0438\u043E\u0434\u0430 WhoopBro \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C 2 \u0434\u043D\u044F.\n\n\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u044C \u043F\u043E\u043B\u043D\u044B\u0435 \u043E\u0442\u0447\u0451\u0442\u044B \u0438 \u0441\u043E\u0432\u0435\u0442\u044B AI.',
    trial_warning_1day: '\u26A0\uFE0F \u0412\u0430\u0448 \u043F\u0440\u043E\u0431\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 \u0437\u0430\u043A\u0430\u043D\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0437\u0430\u0432\u0442\u0440\u0430!\n\n\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u043D\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u043E\u0442\u0447\u0451\u0442\u0430\u043C.',
    expiry_warning: '\u23F3 \u041F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u0438\u0441\u0442\u0435\u043A\u0430\u0435\u0442 \u0447\u0435\u0440\u0435\u0437 2 \u0434\u043D\u044F. \u041F\u0440\u043E\u0434\u043B\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043D\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F.',
    btn_extend_sub: '\uD83D\uDCB3 \u041F\u0440\u043E\u0434\u043B\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443',

    // Brief formatter
    brief_stale_notice: '\u26A0\uFE0F \u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u043D\u0435 \u043F\u0440\u0438\u0448\u043B\u0438. \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u0437\u0430 \u0432\u0447\u0435\u0440\u0430:',
    brief_recovery_label: '\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435',
    brief_hrv_label: '\u0412\u0421\u0420',
    brief_rhr_label: '\u0427\u0421\u0421 \u043F\u043E\u043A\u043E\u044F',
    brief_spo2_label: 'SpO\u2082',
    brief_sleep_label: '\u0421\u043E\u043D',
    brief_sleep_efficiency: '\u044D\u0444\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C',
    brief_rem_label: 'REM',
    brief_deep_label: '\u0413\u043B\u0443\u0431\u043E\u043A\u0438\u0439',
    brief_light_label: '\u041B\u0451\u0433\u043A\u0438\u0439',
    brief_footer: '\u26A0\uFE0F \u042D\u0442\u043E \u043D\u0435 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0430\u044F \u043A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u0446\u0438\u044F',
    btn_detail: '\uD83D\uDCAA \u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435',
    btn_ask: '\u2753 \u0417\u0430\u0434\u0430\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441',
    btn_whynot: '🔍 Почему?',
    no_device_msg: '\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E Whoop \u043D\u0435 \u043D\u0430\u0434\u0435\u0442\u043E. \u041E\u0442\u0434\u044B\u0445\u0430\u0439\u0442\u0435 \u0438 \u043D\u0430\u0447\u043D\u0438\u0442\u0435 \u0437\u0430\u0432\u0442\u0440\u0430 \u0441 \u043D\u043E\u0432\u044B\u043C\u0438 \u0441\u0438\u043B\u0430\u043C\u0438! \uD83D\uDCAA',
    fallback_high: '\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0445\u043E\u0440\u043E\u0448\u0435\u0435! \u0421\u0435\u0433\u043E\u0434\u043D\u044F \u043C\u043E\u0436\u043D\u043E \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u0441\u043E \u0441\u0440\u0435\u0434\u043D\u0435\u0439 \u0438\u043B\u0438 \u0432\u044B\u0441\u043E\u043A\u043E\u0439 \u0438\u043D\u0442\u0435\u043D\u0441\u0438\u0432\u043D\u043E\u0441\u0442\u044C\u044E.',
    fallback_mid: '\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u0440\u0435\u0434\u043D\u0435\u0435. \u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F \u043B\u0451\u0433\u043A\u0430\u044F \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0430 \u0438\u043B\u0438 \u043F\u0440\u043E\u0433\u0443\u043B\u043A\u0430.',
    fallback_low: '\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0438\u0437\u043A\u043E\u0435. \u0421\u0435\u0433\u043E\u0434\u043D\u044F \u043B\u0443\u0447\u0448\u0435 \u043E\u0442\u0434\u043E\u0445\u043D\u0443\u0442\u044C \u0438\u043B\u0438 \u0437\u0430\u043D\u0438\u043C\u0430\u0442\u044C\u0441\u044F \u043E\u0447\u0435\u043D\u044C \u043B\u0435\u0433\u043A\u043E.',
    paywall_msg: '\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0443 \u0434\u043B\u044F \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043E\u0442\u0447\u0451\u0442\u0430, \u0430\u043D\u0430\u043B\u0438\u0437\u0430 \u0441\u043D\u0430 \u0438 \u0441\u043E\u0432\u0435\u0442\u043E\u0432 AI.\n\n14 \u0434\u043D\u0435\u0439 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E!',
    paywall_no_recovery: '\u0414\u0430\u043D\u043D\u044B\u0445 \u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438 \u043D\u0435\u0442',
    btn_subscribe_paywall: '\uD83D\uDCB3 \u041F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u2014 50 000 UZS/\u043C\u0435\u0441',
    detail_title: '\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u044B\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438',
    detail_recovery: '\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435',
    detail_sleep: '\u0421\u043E\u043D',
    detail_strain: '\u041D\u0430\u0433\u0440\u0443\u0437\u043A\u0430',
    detail_duration: '\u0414\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C',
    detail_efficiency: '\u042D\u0444\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C',
    detail_effectiveness: '\u041A\u041F\u0414 \u0441\u043D\u0430',
    detail_respiratory: '\u0427\u0430\u0441\u0442\u043E\u0442\u0430 \u0434\u044B\u0445\u0430\u043D\u0438\u044F',
    detail_workouts: '\u0422\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0438',
    detail_strain_label: '\u0411\u0430\u043B\u043B \u043D\u0430\u0433\u0440\u0443\u0437\u043A\u0438',
    detail_calories: '\u041A\u0430\u043B\u043E\u0440\u0438\u0438',
    late_notice: '\u041F\u0440\u043E\u0441\u0442\u0438\u0442\u0435, \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u044B \u0441 \u043E\u043F\u043E\u0437\u0434\u0430\u043D\u0438\u0435\u043C \uD83D\uDE4F',
    no_device_detail: '\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043D\u0435 \u043D\u0430\u0434\u0435\u0442\u043E.',
    soat: '\u0447',
    daqiqa: '\u043C\u0438\u043D',
    daq: '\u043C\u0438\u043D',
    urish_min: '\u0443\u0434/\u043C\u0438\u043D',
    nafas_min: '\u0434\u044B\u0445\u0430\u043D\u0438\u0439/\u043C\u0438\u043D',
    kkal: '\u043A\u043A\u0430\u043B',
  },
} as const;

// Date formatting per language
const WEEKDAYS: Record<Lang, string[]> = {
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
  ru: ['\u0412\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435', '\u041F\u043E\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0438\u043A', '\u0412\u0442\u043E\u0440\u043D\u0438\u043A', '\u0421\u0440\u0435\u0434\u0430', '\u0427\u0435\u0442\u0432\u0435\u0440\u0433', '\u041F\u044F\u0442\u043D\u0438\u0446\u0430', '\u0421\u0443\u0431\u0431\u043E\u0442\u0430'],
};

const MONTHS: Record<Lang, string[]> = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'],
  ru: ['\u042F\u043D\u0432\u0430\u0440\u044C', '\u0424\u0435\u0432\u0440\u0430\u043B\u044C', '\u041C\u0430\u0440\u0442', '\u0410\u043F\u0440\u0435\u043B\u044C', '\u041C\u0430\u0439', '\u0418\u044E\u043D\u044C', '\u0418\u044E\u043B\u044C', '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043D\u0442\u044F\u0431\u0440\u044C', '\u041E\u043A\u0442\u044F\u0431\u0440\u044C', '\u041D\u043E\u044F\u0431\u0440\u044C', '\u0414\u0435\u043A\u0430\u0431\u0440\u044C'],
};

export function formatDate(dateStr: string, lang: Lang): string {
  const d = new Date(`${dateStr}T12:00:00+05:00`);
  const day = d.getDate();
  const month = MONTHS[lang][d.getMonth()].toLowerCase();
  const year = d.getFullYear();
  const weekday = WEEKDAYS[lang][d.getDay()];
  return `${day}-${month}, ${year} \u2014 ${weekday}`;
}

export function formatDuration(minutes: number, lang: Lang): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} ${t(lang, 'soat')} ${m} ${t(lang, 'daqiqa')}`;
}
