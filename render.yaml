services:
  - type: web
    name: balance-psychoterapia
    env: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: GEMINI_API_KEY
        sync: false
        placeholder: "Twój klucz API dla Gemini"
      - key: APP_URL
        sync: false
        placeholder: "Główny adres URL Twojej aplikacji (np. https://twojadomena.pl lub adres przydzielony przez Render)"
      - key: DISCORD_BOT_TOKEN
        sync: false
        placeholder: "Token bota Discord (opcjonalny)"
      - key: DISCORD_BOOKINGS_CHANNEL_ID
        sync: false
        placeholder: "ID kanału Discord dla zapisów (opcjonalny)"
      - key: DISCORD_LOGS_CHANNEL_ID
        sync: false
        placeholder: "ID kanału Discord dla logów (opcjonalny)"
      - key: DISCORD_COMMANDS_CHANNEL_ID
        sync: false
        placeholder: "ID kanału Discord dla komend (opcjonalny)"
      - key: STRIPE_SECRET_KEY
        sync: false
        placeholder: "Tajny klucz Stripe (sk_test_... lub sk_live_...)"
      - key: STRIPE_PUBLISHABLE_KEY
        sync: false
        placeholder: "Klucz publiczny Stripe (pk_test_... lub pk_live_...)"
