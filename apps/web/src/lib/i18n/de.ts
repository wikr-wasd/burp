import type { Dictionary } from "./sv";

/**
 * Deutsche Texte.
 *
 * Tilltalet är `Sie`. Restaurangbranschen i den tysktalande världen duar inte
 * en gäst hon inte känner, och Burp är en marknadsplats och inte en app för
 * unga — ett felaktigt `du` läser som slarv snarare än som värme.
 *
 * Tyska är inte ett marknadsspråk utan ett gästspråk: turister i Sarajevo,
 * Dubrovnik och Split. Texterna är därför skrivna för någon som är på besök och
 * inte känner till stället, inte för någon som bor där.
 */
export const de: Dictionary = {
  site: {
    forRestaurants: "Für Restaurants",
    forGuests: "Für Gäste",
    home: "Burp — zur Startseite",
    tagline:
      "Jedes Restaurant mit einer eigenen Seite: Speisekarte, Fotos, Öffnungszeiten und Anfahrt. Scannen Sie den QR-Code am Tisch und bestellen Sie — ohne App und ohne Konto.",
    cities: "Städte",
    cuisines: "Küchen",
    restaurantsIn: (city: string) => `Restaurants in ${city}`,
    joinBurp: "Restaurant eintragen",
    logIn: "Anmelden",
    createAccount: "Gastkonto erstellen",
    myOrders: "Meine Bestellungen",
    breadcrumbs: "Navigationspfad",
    allCities: "Alle Städte",
    language: "Sprache",

    /* Navigation in der Kopfzeile. */
    discover: "Entdecken",
    map: "Karte",
    becomePartner: "Partner werden",
    mainNav: "Hauptmenü",
    searchLabel: "Nach Restaurant oder Gericht suchen",
    searchPlaceholder: "Restaurants oder Gerichte suchen",
  },

  discover: {
    title: "Alle Restaurants auf der Karte",
    intro:
      "Sehen Sie, wo die Lokale liegen, bevor Sie sich entscheiden. Filtern Sie nach Küche, Stadt und danach, was gerade geöffnet hat.",
    openNow: "Jetzt geöffnet",
    showAll: "Alle anzeigen",
    sort: "Sortieren",
    sortRating: "Beste Bewertung",
    sortName: "Name A–Z",
    mapLabel: "Karte der Restaurants",
    mapEmpty: "Noch keiner der Treffer hat eine Markierung auf der Karte.",
    mapFailed: "Die Karte konnte nicht geladen werden. Die Liste daneben zeigt dieselben Lokale.",
    results: "Treffer",
    empty: "Kein Restaurant passt zum Filter.",
    emptyHint: "Entfernen Sie einen Filter oder durchsuchen Sie den gesamten Marktplatz.",
  },

  home: {
    label: "Marktplatz für Essen",
    headline: ["Jedes Restaurant,", "eine eigene Seite"],
    headlineCity: (city: string) => `Essen Sie sich durch ${city}.`,
    intro:
      "Speisekarte mit Fotos, Öffnungszeiten und Anfahrt — und bestellen direkt vom Tisch aus per QR-Code. Ohne App, ohne Konto.",
    searchLabel: "Nach Restaurant oder Gericht suchen",
    searchPlaceholder: "Restaurant, Gericht oder Küche suchen",
    searchButton: "Suchen",
    searchHint: "Durchsucht Namen und Beschreibungen der Restaurants.",
    city: "Stadt",
    cuisine: "Küche",
    allCities: "Alle Städte",
    allCuisines: "Alle Küchen",
    seeAllIn: (city: string) => `Alle in ${city}`,
    allRestaurants: "Alle Restaurants",
    hits: (count: number) => (count === 1 ? "1 Treffer" : `${count} Treffer`),
    searchedFor: "Suche",
    featured: "Gerade empfohlen",
    seeMenu: "Zur Speisekarte",
    noRatings: "Noch keine Bewertungen",
    ratingSummary: (average: string, count: number) =>
      `${average} von 5 im Schnitt, ${count} Bewertungen`,
    todayHours: (hours: string) => `Heute ${hours}`,
    closedToday: "Heute geschlossen",
    emptyTitle: "Keine Restaurants gefunden.",
    emptyFiltered: "Versuchen Sie eine andere Suche, eine andere Stadt, oder entfernen Sie die Filter.",
    emptyAll: "Zurzeit gibt es keine aktiven Restaurants.",
    showAll: "Alle Restaurants anzeigen",
  },

  city: {
    label: "Stadt",
    title: (city: string) => `Restaurants in ${city}`,
    intro: (count: number, city: string) =>
      `${count === 1 ? "Ein Restaurant nimmt" : `${count} Restaurants nehmen`} in ${city} Bestellungen über Burp entgegen. Bestellen Sie zur Abholung oder scannen Sie den QR-Code am Tisch.`,
    cuisineLabel: (city: string) => `Küchen in ${city}`,
    cuisineTitle: (cuisine: string, city: string) => `${cuisine} in ${city}`,
    cuisineIntro: (count: number, cuisine: string, city: string) =>
      `${count === 1 ? "Ein Restaurant serviert" : `${count} Restaurants servieren`} ${cuisine.toLowerCase()} in ${city}.`,
    cuisineMeta: (cuisine: string, city: string) =>
      `Bestellen Sie ${cuisine.toLowerCase()} in ${city}. Abholung oder Bestellung direkt am Tisch — ohne App.`,
    otherCuisines: (city: string) => `Andere Küchen in ${city}`,
    emptyTitle: "Hier gibt es noch keine Restaurants.",
    emptyBody: "Führen Sie ein Restaurant in der Nähe?",
    emptyAction: "Restaurant eintragen",
  },

  restaurant: {
    onThisPage: "Auf dieser Seite",
    menu: "Speisekarte",
    findUs: "Anfahrt",
    reviews: "Bewertungen",
    orderForPickup: "Zur Abholung bestellen",
    noMenuTitle: "Zurzeit keine Speisekarte",
    noMenuBody: (name: string) =>
      `${name} hat für diese Tageszeit keine Speisekarte veröffentlicht. Rufen Sie gern dort an.`,
    openToday: (hours: string) => `Heute geöffnet ${hours}`,
    closedToday: "Heute geschlossen",
    phone: "Telefon",
    openingHours: "Öffnungszeiten",
    noOpeningHours: "Keine Öffnungszeiten hinterlegt.",
    closed: "Geschlossen",
    reviewSummary: (average: string, count: number) =>
      `${average} von 5 auf Basis von ${count} ${count === 1 ? "Bewertung" : "Bewertungen"} aus abgeschlossenen Bestellungen.`,
    reviewsEmptyTitle: "Noch keine Bewertungen",
    reviewsEmptyBody: "Bewerten können nur Gäste, die tatsächlich bestellt haben.",
    reviewAuthorFallback: "Gast",
    foodRating: "Bewertung des Essens",
    serviceRating: "Bewertung des Service",
    ratingOutOf: "{n} von 5",
    restaurantReply: "Antwort des Restaurants",
  },

  menu: {
    table: "Tisch {number}",
    pickup: "Abholung",
    noAppNoAccount: "Keine App. Kein Konto. Einfach bestellen.",
    sections: "Bereiche der Speisekarte",
    search: "Speisekarte durchsuchen",
    searchPlaceholder: "Gericht finden",
    searchClear: "Suche zurücksetzen",
    searchEmpty: "Nichts auf der Speisekarte passt zu „{query}“.",
    searchEmptyHint: "Versuchen Sie ein kürzeres Wort oder blättern Sie durch die Bereiche.",
    soldOut: "Heute ausverkauft",
    ongoingOrderLink: "Status und Rechnung ansehen",
    ongoingOrder: "Sie haben eine laufende Bestellung",
    allergens: "Allergene",
    chooseOptions: "Optionen wählen",
    hideOptions: "Optionen ausblenden",
    add: "Hinzufügen",
    added: "Hinzugefügt",
    priceFrom: "Ab {price}",
    chooseExactly: "wählen Sie {n}",
    chooseBetween: "wählen Sie {min}–{max}",
    chooseUpTo: "wählen Sie bis zu {n}",
    optionSoldOut: "(aus)",
    chooseFirst: 'Wählen Sie zuerst bei "{group}"',
    noteToKitchen: "Hinweis für die Küche",
    notePlaceholder: "Z. B. ohne Zwiebeln",
    pickupTime: "Wann möchten Sie abholen?",
    asSoonAsPossible: "So bald wie möglich",
    tip: "Trinkgeld",
    noTip: "Kein Trinkgeld",
    foodAndDrink: "Speisen und Getränke",
    ofWhichVat: "davon MwSt.",
    hide: "Ausblenden",
    itemCount: "{n} Stück",
    order: "Bestellen",
    sending: "Wird gesendet…",
    removeOne: "Ein {name} entfernen",
    addOne: "Ein {name} hinzufügen",
    orderFailed: "Die Bestellung konnte nicht aufgegeben werden. Bitte versuchen Sie es erneut.",
    noConnection: "Keine Verbindung zum Server. Prüfen Sie Ihr Netz und versuchen Sie es erneut.",
    retrying:
      "Keine Verbindung. Ihre Bestellung ist gespeichert und wird gesendet, sobald das Netz zurück ist.",
    retryNow: "Jetzt versuchen",
    retryGaveUp:
      "Wir erreichen den Server nicht. Ihre Bestellung ist gespeichert — tippen Sie, um es erneut zu versuchen.",

    payHow: "Wie möchten Sie bezahlen?",
    payAtPlace: "Vor Ort",
    payByCard: "Mit Karte",
    payByCardHint: "Karte, Apple Pay und Google Pay",
    payNow: "Bezahlen",
    paying: "Zahlung läuft…",
    paymentTitle: "Bestellung bezahlen",
    paymentCancel: "Abbrechen",
    paymentFailed: "Die Zahlung ist fehlgeschlagen. Versuchen Sie es erneut oder zahlen Sie vor Ort.",
    paymentAbandoned: "Die Zahlung wurde abgebrochen. Die Bestellung wurde nicht aufgegeben.",

    coupon: "Rabattcode",
    couponPlaceholder: "Z. B. SOMMER25",
    couponApply: "Einlösen",
    couponChecking: "Wird geprüft…",
    couponRemove: "Code entfernen",
    discount: "Rabatt",

    giftCard: "Gutschein",
    giftCardPlaceholder: "ABCD-EFGH-JKLM",
    giftCardApply: "Einsetzen",
    giftCardChecking: "Wird geprüft…",
    giftCardRemove: "Gutschein entfernen",
    giftCardLeft: "{amount} bleiben übrig",
    toPay: "Zu zahlen",

    punchCard: "Treuekarte",
    punchCardProgress: "{visits} von {size} Besuchen",
    punchCardRemaining: "Noch {n} Besuche bis zu einer Gratismahlzeit",
    punchCardEarned: "Diese Mahlzeit geht auf das Restaurant",
    punchCardUse: "Treuekarte einlösen",
  },

  table: {
    tooManyTitle: "Zu viele Versuche",
    tooManyBody: "Warten Sie einen Moment und scannen Sie den Code erneut.",
    lockedTitle: "Dieser Tisch nimmt keine Bestellungen an",
    lockedBody: "Wenden Sie sich an das Personal, man hilft Ihnen gern.",
    closedTitle: "Das Restaurant ist geschlossen",
    closedBody: "Bestellungen sind nur während der Öffnungszeiten möglich.",
    noMenuTitle: "Zurzeit keine Speisekarte",
    noMenuBody:
      "Das Restaurant hat für diese Tageszeit keine Speisekarte veröffentlicht. Wenden Sie sich an das Personal.",
  },

  receipt: {
    title: "Ihre Bestellung",
    table: "Tisch {number}",
    pickup: "Abholung",
    pickupAt: "Abholung bei",
    yourBill: "Ihre Rechnung",
    foodAndDrink: "Speisen und Getränke",
    discount: "Rabatt",
    tip: "Trinkgeld",
    total: "Gesamt",
    payOnPickup: "Die Zahlung erfolgt vor Ort bei der Abholung.",
    payAtTable: "Die Zahlung erfolgt vor Ort.",
    paidByCard: "Mit Karte bezahlt.",
    paidInTerminal: "Mit Karte im Restaurant bezahlt.",
    refundedNotice: "Diese Bestellung wurde erstattet.",
    notFiscalReceipt:
      "Dies ist eine Bestellbestätigung, keine steuerliche Quittung. Die Quittung erhalten Sie vom Restaurant.",

    reviewPrompt: "Wie war das Essen?",
    reviewOpen: "Bewertung abgeben",
    reviewFood: "Essen",
    reviewService: "Service",
    reviewOptional: "optional",
    reviewComment: "Kommentar",
    reviewStar: "{n} von 5",
    reviewSubmit: "Senden",
    reviewSending: "Wird gesendet…",
    reviewCancel: "Abbrechen",
    reviewThanks: "Danke. Ihre Bewertung hilft dem nächsten Gast.",
    reviewAlready: "Sie haben diese Bestellung bereits bewertet.",
    reviewFailed: "Die Bewertung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
    backTo: "Zurück zu {name}",
    progress: "Verlauf der Bestellung",
    contactRestaurant: "Wenden Sie sich an das Restaurant, wenn Sie Fragen zur Bestellung haben.",
    enjoy: "Guten Appetit",
    onTheWay: "Ihr Essen ist auf dem Weg zum Tisch.",
    minutesLeft: "Noch etwa {n} Minuten.",
    almostReady: "Gleich fertig.",
    editTitle: "Bestellung ändern",
    editWindow: "Sie können noch {n} Sekunden lang ändern.",
    editExpired: "Die Zeit für Änderungen ist abgelaufen.",
    removeItem: "Ein Gericht entfernen",
    remove: "Entfernen",
    cancelOrder: "Bestellung stornieren",
    cancelWarning: "Die gesamte Bestellung wird storniert.",
    orderMore: "Mehr bestellen",
    cancelConfirm: "Ja, stornieren",
    cancelKeep: "Behalten",
    changeFailed: "Die Änderung ist fehlgeschlagen.",
    status: {
      DRAFT: "Entwurf",
      PLACED: "Aufgegeben",
      ACCEPTED: "Angenommen",
      PREPARING: "In Zubereitung",
      READY: "Fertig",
      COMPLETED: "Serviert",
      CANCELLED: "Storniert",
      REFUNDED: "Erstattet",
    },
  },

  errors: {
    notFoundLabel: "404",
    notFoundTitle: "Diese Seite gibt es nicht.",
    notFoundBody:
      "Die Adresse hat sich möglicherweise geändert, oder das Restaurant nimmt keine Bestellungen mehr über Burp an. Versuchen Sie eine der Städte unten.",
    notFoundAction: "Zur Startseite",
    errorLabel: "Fehler",
    errorTitle: "Etwas ist schiefgelaufen.",
    errorBody:
      "Das liegt an uns, nicht an Ihnen. Versuchen Sie es erneut — und wenn es dann immer noch nicht klappt, rufen Sie einfach direkt im Restaurant an.",
    errorRetry: "Erneut versuchen",
    loading: "Wird geladen…",
  },

  directions: {
    copy: "Adresse kopieren",
    copied: "Kopiert",
    copiedNotice: "Die Adresse wurde in die Zwischenablage kopiert.",
    opensInNewTab: " — öffnet die Route in einem neuen Tab",
    mapOf: (name: string) => `Karte von ${name}`,
  },

  staff: {
    home: "Burp — zur Startseite",
    navLabel: "Navigation für Mitarbeitende",
    logOut: "Abmelden",
    language: "Sprache",
    languageSaving: "Wird gespeichert…",
    languageError: "Die Sprache konnte nicht gespeichert werden. Versuchen Sie es erneut.",

    role: {
      owner: "Inhaber",
      manager: "Leitung",
      staff: "Mitarbeitende",
      kitchen: "Küche",
    },

    section: {
      oversikt: "Übersicht",
      order: "Bestellungen",
      kok: "Küchenbildschirm",
      kassa: "Kasse",
      meny: "Speisekarte",
      bord: "Tische & QR",
      erbjudanden: "Angebote",
      omdomen: "Bewertungen",
      statistik: "Statistik",
      avrakning: "Abrechnung",
      handelser: "Ereignisse",
      personal: "Mitarbeitende",
      installningar: "Einstellungen",
    },

    status: {
      DRAFT: "Entwurf",
      PLACED: "Aufgegeben",
      ACCEPTED: "Angenommen",
      PREPARING: "In Zubereitung",
      READY: "Fertig",
      COMPLETED: "Abgeschlossen",
      CANCELLED: "Storniert",
      REFUNDED: "Erstattet",
    },

    provider: {
      CASH: "Bar",
      TERMINAL: "Karte am Terminal",
      GIFT_CARD: "Gutschein",
      STRIPE: "Karte",
      MONRI: "Karte",
    },

    kitchen: {
      live: "Bestellungen live",
      sound: "Ton",
      soundOn: "ein",
      soundOff: "aus",
      empty: "Keine aktiven Bestellungen.",
      updateFailed: "Bestellung konnte nicht aktualisiert werden: {message}",
      sibling: "Bestellung {index} von {count} für den Tisch",
      minutes: "{n} min",

      stepACCEPTED: "Annehmen",
      stepPREPARING: "Zubereitung starten",
      stepREADY: "Fertig",
      stepCOMPLETED: "Serviert",

      reject: "Ablehnen",
      rejectConfirm: "Bestellung ablehnen",
      cancel: "Abbrechen",

      upcomingTitle: "Demnächst",
      upcomingHint: "Geht an die Küche, sobald nur noch die Zubereitungszeit bleibt.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    orderType: {
      table: "Tisch {number}",
      TABLE: "Tisch",
      PICKUP: "Abholung",
      DELIVERY: "Lieferung",
    },

    /* Kassan. ENBART strängar — skickas till klientkomponenter. */
    register: {
      toSettle: "Zu kassieren",
      emptyTitle: "Alles kassiert",
      emptyBody: "Jede abgeschlossene Bestellung des letzten Tages hat eine erfasste Zahlung.",
      paidToday: "Heute bezahlt",
      paidTodayHint:
        "Der Nachweis der Schicht, bar und Karte. Die Zeilen lassen sich nicht ändern — eine Fehlbuchung wird mit einer Gegenbuchung korrigiert, nicht durch Umschreiben der Historie.",

      onSameBill: "{count} auf derselben Rechnung",
      alreadyPaid: "{paid} bereits bezahlt von {total}",
      showOrders: "Bestellungen anzeigen",
      hideOrders: "Bestellungen ausblenden",

      amountReceived: "Erhaltener Betrag",
      method: "Zahlungsart",
      settle: "Kassieren",
      settleTable: "Ganzen Tisch kassieren",
      settling: "Wird kassiert…",
      settleFailed: "Die Buchung ist nicht durchgegangen.",

      closeBill: "Rechnung ohne Buchung schließen",
      closeConfirm:
        "Die Rechnung ohne jede Buchung schließen? Die Bestellungen bleiben und lassen sich einzeln kassieren.",
      closeFailed: "Die Rechnung konnte nicht geschlossen werden.",

      over: "Über der Rechnung um",
      under: "Unter der Rechnung um",
      spreadHint: "Wird anteilig auf die Bestellungen des Tisches verteilt.",
      asEntered:
        "Wird so erfasst, wie es dasteht — Rundung und Rabatt im Haus sollen sichtbar sein.",
      unreadableAmount: "Der Betrag ließ sich nicht lesen.",

      servedAt: "Serviert {when}",
      paidOfTotal: "{paid} bezahlt von {total}",
      billTotal: "Rechnung {total}",
      refundedAmount: "{amount} erstattet",
      remaining: "{amount} offen",

      refund: "Erstatten",
      refunding: "Wird erstattet…",
      refundFailed: "Die Erstattung ist nicht durchgegangen.",
      refundAmount: "Betrag",
      refundReason: "Grund",
      refundReasonPlaceholder: "Z. B. kalte Suppe",
      refundTooMuch: "Mehr als noch offen ist ({amount}).",
      cancel: "Abbrechen",

      refundHintGIFT_CARD: "Der Wert geht zurück auf den Gutschein, nicht in die Kasse.",
      refundHintCASH:
        "Wird als Gegenbuchung erfasst. Die Scheine geben Sie über den Tresen zurück.",
      refundHintTERMINAL:
        "Wird als Gegenbuchung erfasst. Die Erstattung machen Sie am Terminal — Burp erreicht es nicht.",
      refundHintPROVIDER:
        "Geht über den Anbieter zurück auf die Karte des Gastes. Kann einige Tage dauern.",

      intro:
        "Abgeschlossene Bestellungen des letzten Tages. Eine Tischrunde steht als eine Rechnung und wird in einem Zug kassiert; der Betrag wird für Sie auf die Bestellungen verteilt. Mit Karte bezahlte Bestellungen sind bereits kassiert.",
      tipsTitle: "Trinkgeld zum Verteilen",
      tipsCash: "{amount} bar",
      tipsCard: "{amount} per Karte",
      tipsPending: "{amount} auf noch nicht bezahlten Rechnungen",
      tipsPeriod: "Der letzte Tag",
      tipsHint:
        "Trinkgeld ist das Geld der Mitarbeitenden und zählt weder zum Umsatz noch zur Gebühr von Burp. Eine erstattete Rechnung zählt nicht.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    overview: {
      statOrders: "Bestellungen heute",
      statRevenue: "Umsatz heute",
      statAverage: "Durchschnitt je Bestellung",
      statTips: "Trinkgeld heute",
      statTipsHint: "gehört den Mitarbeitenden, nicht dem Restaurant",

      inKitchen: "Gerade in der Küche",
      allOrders: "Alle Bestellungen",
      noOrdersTitle: "Gerade keine Bestellungen",
      noOrdersBody: "Neue Bestellungen erscheinen hier, sobald ein Gast sie abschickt.",

      tables: "Tische",
      tablesBusy: "{busy} von {total} belegt",
      noTablesTitle: "Keine Tische angelegt",
      noTablesBody: "Legen Sie die Tische an, um QR-Aufkleber drucken zu können.",
      noTablesAction: "Tische anlegen",

      stateLEDIGT: "Frei",
      stateOPPEN_NOTA: "Offene Rechnung",
      stateBESTALLNING: "Bestellung da",
      stateSERVERAS: "Fertig zum Servieren",
    },

    /* Personalsidan. ENBART strängar — skickas till klientkomponenter. */
    staffAdmin: {
      intro:
        "Wer hier arbeitet, in welcher Rolle, und wer eingeladen ist, aber noch nicht beigetreten.",
      actionFailed: "Die Aktion ist nicht durchgegangen.",

      inviteTitle: "Jemanden einladen",
      inviteHint:
        "Die Person erhält einen Link, der sieben Tage gilt und nur für die hier eingetragene Adresse.",
      email: "E-Mail-Adresse",
      emailPlaceholder: "name@beispiel.de",
      role: "Rolle",
      invite: "Einladen",

      inviteCreated: "Einladung erstellt",
      inviteSendYourself: "Eine E-Mail ist unterwegs. Sie können den Link auch selbst senden:",
      copy: "Kopieren",
      copied: "Kopiert",

      pendingTitle: "Wartet auf Antwort",
      validUntil: "gültig bis {date}",
      revoke: "Zurückziehen",

      membersTitle: "Mitarbeitende",
      you: "(Sie)",
      ended: "beendet",
      end: "Beenden",
      resume: "Fortsetzen",
    },

    upcomingLater: (count: number) =>
      count === 1
        ? "1 Vorbestellung später heute."
        : `${count} Vorbestellungen später heute.`,
  },

  weekday: {
    mon: "Montag",
    tue: "Dienstag",
    wed: "Mittwoch",
    thu: "Donnerstag",
    fri: "Freitag",
    sat: "Samstag",
    sun: "Sonntag",
  },
};
