/**
 * Svenska texter — och samtidigt formen som alla andra språk måste följa.
 *
 * Typen `Dictionary` härleds ur den här filen. Lägger någon till en nyckel här
 * utan att lägga till den i `en.ts` slutar bygget kompilera. Det är hela
 * poängen: en översättning som glömts bort ska inte kunna nå produktion och
 * visa sig som en tom sträng för en gäst.
 */
export const sv = {
  site: {
    forRestaurants: "För restauranger",
    home: "Burp — till startsidan",
    tagline:
      "Varje restaurang med sin egen sida: meny, bilder, öppettider och vägbeskrivning. Skanna QR-koden vid bordet och beställ — utan app och utan konto.",
    cities: "Städer",
    cuisines: "Kök",
    restaurantsIn: (city: string) => `Restauranger i ${city}`,
    joinBurp: "Anslut din restaurang",
    logIn: "Logga in",
    createAccount: "Skapa gästkonto",
    myOrders: "Mina beställningar",
    breadcrumbs: "Brödsmulor",
    allCities: "Alla städer",
    language: "Språk",

    /* Sidhuvudets navigering. */
    discover: "Upptäck",
    map: "Karta",
    becomePartner: "Bli partner",
    mainNav: "Huvudmeny",
    searchLabel: "Sök efter restaurang eller maträtt",
    searchPlaceholder: "Sök restauranger eller rätter",
  },

  /* Kartsidan /upptack. */
  discover: {
    title: "Alla restauranger på kartan",
    intro:
      "Se var ställena ligger innan du bestämmer dig. Filtrera på kök, stad och vad som har öppet just nu.",
    openNow: "Öppet nu",
    showAll: "Visa alla",
    sort: "Sortera",
    sortRating: "Högst betyg",
    sortName: "Namn A–Ö",
    mapLabel: "Karta över restaurangerna",
    mapEmpty: "Ingen av träffarna har någon kartnål ännu.",
    mapFailed: "Kartan gick inte att ladda. Listan bredvid visar samma ställen.",
    results: "Träffar",
    empty: "Ingen restaurang matchar filtret.",
    emptyHint: "Ta bort ett filter, eller sök i hela marknadsplatsen.",
  },

  home: {
    label: "Matmarknadsplats",
    headline: ["Varje restaurang,", "sin egen sida"] as readonly [string, string],
    headlineCity: (city: string) => `Ät dig igenom ${city}.`,
    intro:
      "Meny med bilder, öppettider och vägbeskrivning — och beställning direkt från bordet med en QR-kod. Ingen app, inget konto.",
    searchLabel: "Sök efter restaurang eller maträtt",
    searchPlaceholder: "Sök restaurang, rätt eller kök",
    searchButton: "Sök",
    searchHint: "Söker i restaurangnamn och beskrivningar.",
    city: "Stad",
    cuisine: "Kök",
    allCities: "Alla städer",
    allCuisines: "Alla kök",
    seeAllIn: (city: string) => `Alla i ${city}`,
    allRestaurants: "Alla restauranger",
    hits: (count: number) => (count === 1 ? "1 träff" : `${count} träffar`),
    searchedFor: "Sökning",
    featured: "Utvald just nu",
    seeMenu: "Se menyn",
    noRatings: "Inga omdömen än",
    ratingSummary: (average: string, count: number) =>
      `${average} av 5 i snitt, ${count} omdömen`,
    todayHours: (hours: string) => `Idag ${hours}`,
    closedToday: "Stängt idag",
    emptyTitle: "Inga restauranger matchade.",
    emptyFiltered: "Pröva en annan sökning, en annan stad eller ta bort filtren.",
    emptyAll: "Det finns inga aktiva restauranger att visa just nu.",
    showAll: "Visa alla restauranger",
  },

  city: {
    label: "Stad",
    title: (city: string) => `Restauranger i ${city}`,
    intro: (count: number, city: string) =>
      `${count === 1 ? "En restaurang" : `${count} restauranger`} tar emot beställningar via Burp i ${city}. Beställ för avhämtning eller skanna QR-koden vid bordet.`,
    cuisineLabel: (city: string) => `Kök i ${city}`,
    cuisineTitle: (cuisine: string, city: string) => `${cuisine} i ${city}`,
    cuisineIntro: (count: number, cuisine: string, city: string) =>
      `${count === 1 ? "En restaurang" : `${count} restauranger`} serverar ${cuisine.toLowerCase()} i ${city}.`,
    /** Meta-beskrivning. Får inte innehålla ett antal — sidan är cachad och
        siffran skulle ljuga i sökresultatet timmen ut. */
    cuisineMeta: (cuisine: string, city: string) =>
      `Beställ ${cuisine.toLowerCase()} i ${city}. Avhämtning eller beställning direkt vid bordet — utan app.`,
    otherCuisines: (city: string) => `Andra kök i ${city}`,
    emptyTitle: "Inga restauranger här än.",
    emptyBody: "Driver du en restaurang i området?",
    emptyAction: "Anslut din restaurang",
  },

  restaurant: {
    onThisPage: "På den här sidan",
    menu: "Meny",
    findUs: "Hitta hit",
    reviews: "Omdömen",
    orderForPickup: "Beställ för avhämtning",
    noMenuTitle: "Ingen meny just nu",
    noMenuBody: (name: string) =>
      `${name} har inte publicerat någon meny för den här tiden. Ring gärna dit och fråga.`,
    openToday: (hours: string) => `Öppet idag ${hours}`,
    closedToday: "Stängt idag",
    phone: "Telefon",
    openingHours: "Öppettider",
    noOpeningHours: "Öppettider saknas.",
    closed: "Stängt",
    reviewSummary: (average: string, count: number) =>
      `${average} av 5 baserat på ${count} ${count === 1 ? "omdöme" : "omdömen"} från genomförda beställningar.`,
    reviewsEmptyTitle: "Inga omdömen än",
    reviewsEmptyBody: "Betyg kan bara lämnas av gäster som faktiskt beställt.",
    reviewAuthorFallback: "Gäst",
    foodRating: "Betyg på maten",
    serviceRating: "Servicebetyg",
    ratingOutOf: "{n} av 5",
    restaurantReply: "Svar från restaurangen",
  },

  /**
   * Menyn och varukorgen.
   *
   * Skickas som ett `labels`-objekt till klientkomponenten i stället för att
   * den slår upp språket själv. Klientkod ska inte behöva veta att språk
   * finns — och QR-sidan väljer sitt språk på Accept-Language medan
   * restaurangsidan får sitt ur URL:en, så uppslaget kan inte ligga i
   * komponenten.
   *
   * ENBART strängar här, aldrig funktioner. Objektet passerar server/klient-
   * gränsen, och React kan inte serialisera en funktion — sidan svarar 500.
   * Variabler skrivs som `{namn}` och fylls i av `fill()` på klientsidan.
   */
  menu: {
    table: "Bord {number}",
    pickup: "Avhämtning",
    /* Bordsbannern. Bekräftar för gästen att koden gick till rätt bord. */
    noAppNoAccount: "Ingen app. Inget konto. Beställ direkt.",
    sections: "Menyns avdelningar",
    search: "Sök i menyn",
    searchPlaceholder: "Sök efter en rätt",
    searchClear: "Rensa sökningen",
    searchEmpty: "Ingenting på menyn matchar ”{query}”.",
    searchEmptyHint: "Prova ett kortare ord, eller bläddra i avdelningarna.",
    soldOut: "Slut för dagen",
    allergens: "Allergener",
    chooseOptions: "Välj tillval",
    hideOptions: "Dölj tillval",
    add: "Lägg till",
    added: "Tillagd",
    priceFrom: "Från {price}",
    chooseExactly: "välj {n}",
    chooseBetween: "välj {min}–{max}",
    chooseUpTo: "välj upp till {n}",
    optionSoldOut: "(slut)",
    chooseFirst: 'Välj i "{group}" först',
    noteToKitchen: "Meddelande till köket",
    notePlaceholder: "T.ex. utan lök",
    pickupTime: "När vill du hämta?",
    asSoonAsPossible: "Så snart som möjligt",
    tip: "Dricks",
    noTip: "Ingen",
    foodAndDrink: "Mat och dryck",
    ofWhichVat: "varav moms",
    hide: "Dölj",
    itemCount: "{n} st",
    order: "Beställ",
    sending: "Skickar…",
    removeOne: "Ta bort en {name}",
    addOne: "Lägg till en {name}",
    orderFailed: "Beställningen kunde inte läggas. Försök igen.",
    noConnection: "Ingen kontakt med servern. Kontrollera nätet och försök igen.",

    /*
     * Nätet blinkade mitt i beställningen.
     *
     * Gästen sitter kvar vid bordet med sidan öppen, så appen försöker själv
     * i stället för att lämna över ansvaret. Texten säger att beställningen
     * ligger kvar — det är det gästen är orolig för, och utan den meningen
     * trycker hon på knappen igen i onödan.
     */
    retrying: "Ingen anslutning. Din beställning ligger kvar och skickas när nätet är tillbaka.",
    retryNow: "Försök nu",
    retryGaveUp: "Vi når inte servern. Din beställning ligger kvar — tryck för att försöka igen.",

    /*
     * Betalsätt.
     *
     * Kontant står först och är förvalt. Det är inte en eftergift — kontanter
     * är fortfarande utbredda i restaurangledet i Bosnien och Serbien, och
     * kortknappen visas bara när restaurangen faktiskt har ett betalkonto.
     */
    payHow: "Hur vill du betala?",
    payAtPlace: "På plats",
    payByCard: "Med kort",
    payByCardHint: "Kort, Apple Pay och Google Pay",
    payNow: "Betala",
    paying: "Betalar…",
    paymentTitle: "Betala din beställning",
    paymentCancel: "Avbryt",
    paymentFailed: "Betalningen gick inte igenom. Försök igen eller betala på plats.",
    paymentAbandoned: "Betalningen avbröts. Beställningen lades aldrig.",

    /*
     * Rabattkoden.
     *
     * Gästen skriver en kod, aldrig ett belopp. Servern slår upp kupongen och
     * räknar rabatten — samma regel som gäller priser.
     */
    coupon: "Rabattkod",
    couponPlaceholder: "T.ex. SOMMAR25",
    couponApply: "Använd",
    couponChecking: "Kontrollerar…",
    couponRemove: "Ta bort koden",
    discount: "Rabatt",

    /*
     * Presentkortet.
     *
     * Skilt från rabattkoden med flit. Ett presentkort är betalmedel och
     * sänker vad som ska betalas; en rabattkod sänker notan. För gästen är
     * skillnaden att presentkortets rest ligger kvar till nästa gång.
     */
    giftCard: "Presentkort",
    giftCardPlaceholder: "ABCD-EFGH-JKLM",
    giftCardApply: "Använd",
    giftCardChecking: "Kontrollerar…",
    giftCardRemove: "Ta bort presentkortet",
    giftCardLeft: "{amount} kvar efteråt",
    toPay: "Att betala",

    /*
     * Klippkortet.
     *
     * Räknar besök och inte kronor — det är hela skillnaden mot poängen, och
     * det är därför texten säger "besök" och aldrig "poäng".
     */
    punchCard: "Klippkort",
    punchCardProgress: "{visits} av {size} besök",
    punchCardRemaining: "{n} besök kvar till en gratis måltid",
    punchCardEarned: "Den här måltiden bjuder restaurangen på",
    punchCardUse: "Använd klippkortet",
  },

  /** Meddelanden på QR-sidan innan menyn visas. */
  table: {
    tooManyTitle: "För många försök",
    tooManyBody: "Vänta en stund och skanna koden igen.",
    lockedTitle: "Bordet tar inte emot beställningar",
    lockedBody: "Prata med personalen så hjälper de dig.",
    closedTitle: "Restaurangen är stängd",
    closedBody: "Beställningar går bara att lägga under öppettiderna.",
    noMenuTitle: "Ingen meny just nu",
    noMenuBody: "Restaurangen har inte publicerat någon meny för den här tiden. Prata med personalen.",
  },

  /**
   * Kvittot och orderns förlopp.
   *
   * Statusetiketterna finns även som `ORDER_STATUS_LABELS` i @burp/core. Där
   * är de svenska och används av personalytorna, som inte är översatta. Att
   * duplicera dem här är avsiktligt: gästens och köksskärmens ordval behöver
   * inte vara samma, och köket ska inte byta språk för att en gäst gjorde det.
   *
   * ENBART strängar — objektet passerar till klientkomponenter.
   */
  receipt: {
    title: "Din beställning",
    table: "Bord {number}",
    pickup: "Avhämtning",
    pickupAt: "Hämtas hos",
    yourBill: "Din nota",
    foodAndDrink: "Mat och dryck",
    discount: "Rabatt",
    tip: "Dricks",
    total: "Totalt",
    payOnPickup: "Betalning sker på plats vid upphämtning.",
    payAtTable: "Betalning sker på plats.",
    paidByCard: "Betald med kort.",
    /*
     * Kort i restaurangens EGEN terminal, registrerat av personalen.
     *
     * Skild från `paidByCard`, som gäller kortet gästen betalade med i sin
     * telefon genom Burp. Skillnaden spelar roll när något ska betalas
     * tillbaka: det kortet når vi, det här gör vi inte.
     */
    paidInTerminal: "Betald med kort i restaurangen.",
    refundedNotice: "Beställningen är återbetald.",
    /*
     * Fiskalisering.
     *
     * Kroatien kräver sedan 2026-01-01 att varje kvitto till en konsument
     * rapporteras till skattemyndigheten och förses med en signatur, oavsett
     * betalsätt; Serbien har motsvarande krav sedan 2022. Burp gör inte det —
     * restaurangen har sin egen fiskalkassa.
     *
     * Att då visa ett dokument med ordersumma och momsuppdelning utan att säga
     * vad det är kan läsas som ett kvitto som borde ha fiskaliserats. Raden
     * nedan är hela skillnaden mellan en orderbekräftelse och ett skattekvitto.
     */
    notFiscalReceipt: "Det här är en orderbekräftelse, inte ett kvitto. Kvittot får du av restaurangen.",

    /*
     * Omdömet, frågat på plats.
     *
     * QR-gästen är anonym och har ingen adress — ett brev efteråt når aldrig
     * fram. Den som just ätit svarar vid bordet eller inte alls.
     */
    reviewPrompt: "Hur var maten?",
    reviewOpen: "Lämna omdöme",
    reviewFood: "Maten",
    reviewService: "Servicen",
    reviewOptional: "valfritt",
    reviewComment: "Kommentar",
    reviewStar: "{n} av 5",
    reviewSubmit: "Skicka",
    reviewSending: "Skickar…",
    reviewCancel: "Avbryt",
    reviewThanks: "Tack. Omdömet hjälper nästa gäst.",
    reviewAlready: "Du har redan lämnat ett omdöme på den här beställningen.",
    reviewFailed: "Omdömet kunde inte sparas. Försök igen.",
    backTo: "Tillbaka till {name}",
    progress: "Orderns förlopp",
    // Neutral med flit. Blocket visas på både bordskvittot och
    // avhämtningskvittot, och "prata med personalen" är fel råd till den som
    // sitter hemma och väntar på att gå och hämta.
    contactRestaurant: "Kontakta restaurangen om du har frågor om beställningen.",
    enjoy: "Smaklig måltid",
    onTheWay: "Maten är på väg till bordet.",
    minutesLeft: "Ungefär {n} minuter kvar.",
    almostReady: "Snart klart.",
    editTitle: "Ändra beställningen",
    editWindow: "Du kan ändra i {n} sekunder till.",
    editExpired: "Tiden för att ändra har gått ut.",
    removeItem: "Ta bort en rätt",
    remove: "Ta bort",
    cancelOrder: "Avbryt beställningen",
    cancelWarning: "Hela beställningen avbryts.",
    changeFailed: "Ändringen gick inte igenom.",
    status: {
      DRAFT: "Utkast",
      PLACED: "Lagd",
      ACCEPTED: "Mottagen",
      PREPARING: "Tillagas",
      READY: "Klar",
      COMPLETED: "Serverad",
      CANCELLED: "Avbruten",
      REFUNDED: "Återbetald",
    },
  },

  /** Sidor som inte finns, och fel som inte gick att undvika. */
  errors: {
    notFoundLabel: "404",
    notFoundTitle: "Sidan finns inte.",
    notFoundBody: "Adressen kan ha ändrats, eller så har restaurangen slutat ta emot beställningar via Burp. Prova någon av städerna nedan.",
    notFoundAction: "Till startsidan",
    errorLabel: "Fel",
    errorTitle: "Något gick fel.",
    errorBody: "Det är vårt fel, inte ditt. Försök igen — funkar det inte heller går det bra att ringa restaurangen direkt.",
    errorRetry: "Försök igen",
    loading: "Laddar…",
  },

  directions: {
    copy: "Kopiera adress",
    copied: "Kopierad",
    copiedNotice: "Adressen är kopierad till urklipp.",
    opensInNewTab: " — öppnar vägbeskrivning i ny flik",
    mapOf: (name: string) => `Karta över ${name}`,
  },

  weekday: {
    mon: "Måndag",
    tue: "Tisdag",
    wed: "Onsdag",
    thu: "Torsdag",
    fri: "Fredag",
    sat: "Lördag",
    sun: "Söndag",
  },
};

/**
 * Formen alla språk delar.
 *
 * Härledd ur svenskan utan `as const`: nycklarna och typerna är gemensamma,
 * texterna är det inte. Med `as const` hade varje svensk sträng blivit sin
 * egen literaltyp, och engelskan kunnat innehålla exakt en sak — svenska.
 */
export type Dictionary = typeof sv;
