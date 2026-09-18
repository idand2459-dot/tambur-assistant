// Hebrew bot-layer messages (SPEC §8, §8.1). These are the fixed texts the Telegram layer
// itself sends (welcome, reset, non-text, throttle). LLM answers and the API-failure
// apology come from the LLM layer.

export const botMessages = {
  welcome:
    'שלום! אני העוזר הדיגיטלי של טכניק טמבור. אפשר לשאול אותי על מוצרים, מחירים, ' +
    'זמינות ושעות פתיחה. איך אפשר לעזור?',
  reset: 'התחלנו שיחה חדשה 🙂 איך אפשר לעזור?',
  nonText: 'אני יכול לקרוא רק טקסט. אפשר לכתוב לי את השאלה?',
  throttle: 'רגע אחד 🙂 אני עדיין מטפל בהודעה הקודמת. נסה שוב עוד רגע.',
};
