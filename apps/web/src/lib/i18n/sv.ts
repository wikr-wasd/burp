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
    share: "Dela",
    shareCopied: "Länken är kopierad",
    forRestaurants: "För restauranger",
    forGuests: "För gäster",
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

  /**
   * Pulsen på startsidan — de riktiga siffrorna, aldrig påhittade.
   *
   * Varje tal är räknat ur databasen (`platform_pulse()`, migration 0073) och
   * utelämnas när det är för litet för att bära sig självt. Se
   * `lib/activity.ts` för trösklarna och varför de finns.
   *
   * ENBART strängar.
   */
  pulse: {
    title: "Just nu på Burp",
    restaurants: "{n} restauranger",
    cities: "{n} städer",
    openNow: "{n} öppna nu",
    ordersWeek: "{n} beställningar den här veckan",
    rating: "{rating} i snitt på {n} omdömen",
    ago: "för {n} min sedan",
    justNow: "nyss",
    popular: "Populär den här veckan",
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
    mapClosed: "Inget är öppet just nu. Kartan visar det som har öppet.",

    /*
     * Platsknappen på kartan.
     *
     * `{unit}` är "m" eller "km" och kommer ur `roundDistance()` i core.
     * Enheten står inte i ordboken därför att den inte översätts — meter
     * heter meter på alla fem språken — men ORDNINGEN mellan tal och enhet,
     * och ordet efter, gör det.
     */
    mapCluster: "{count} restauranger här",
    mapSearchArea: "Sök i det här området",
    mapClearArea: "Visa alla igen",
    mapLocate: "Visa var jag är",
    mapLocating: "Letar…",
    mapLocateFailed: "Platsen är inte tillgänglig",
    mapYouAreHere: "Du är här",
    mapDistanceAway: "{value} {unit} härifrån",
    results: "Träffar",
    empty: "Ingen restaurang matchar filtret.",
    emptyHint: "Ta bort ett filter, eller sök i hela marknadsplatsen.",
  },

  /**
   * Värvningssidan `/anslut`.
   *
   * Den enda vägen in för en restaurang, och därför den sida där ett språkfel
   * kostar mest: en restauratör i Sarajevo som landar på ett svenskt formulär
   * fyller inte i det. Den ligger under språksegmentet av samma skäl som
   * stadssidorna — den är indexerad, och en sida utan språk i adressen kan
   * bara nå sökresultaten på ett av fem språk.
   *
   * Skickas till en klientkomponent och måste därför vara rena strängar rakt
   * igenom. Variabler skrivs `{namn}` och fylls i med `fill()`.
   */
  /*
   * Registrering och inloggning.
   *
   * Båda ytorna är noindex och läser `Accept-Language`, som `/konto` och
   * QR-sidan. En indexerad sida MÅSTE ha språket i adressen — Google indexerar
   * en URL, inte en cookie — och de här två har det inte. Att hålla dem
   * osynliga för sökmotorn är det som gör att de får läsa språket ur begäran.
   *
   * Ingen letar heller efter "skapa konto" i en sökmotor. Sidan nås från
   * sidfoten och från /anslut.
   */
  auth: {
    signUpLabel: "Gästkonto",
    signUpTitle: "Skapa konto",
    signUpBody: "Spara dina beställningar, favoriter och adresser. Du kan beställa utan konto också.",
    haveAccount: "Har du redan ett konto?",
    name: "Namn",
    nameOptional: "valfritt",
    email: "E-post",
    password: "Lösenord",
    passwordHint: "Minst 8 tecken.",
    passwordTooShort: "Lösenordet behöver minst 8 tecken.",
    emailTaken: "Det finns redan ett konto med den e-postadressen.",
    signUpFailed: "Kontot kunde inte skapas. Försök igen.",
    signingUp: "Skapar konto…",
    signUpButton: "Skapa konto",
    confirmSent: "Nästan klart. Vi har skickat en bekräftelselänk till {email} — klicka på den så är kontot igång.",
    marketingOptIn: "Ja tack, skicka nyheter och erbjudanden till mig. Du kan tacka nej när du vill under Mina uppgifter.",
    loginLabel: "För restauranger",
    loginTitle: "Logga in",
    loginBody: "Order, köksskärm, meny och statistik för din restaurang.",
    loginFailed: "Fel e-postadress eller lösenord.",
    loggingIn: "Loggar in…",
    loginButton: "Logga in",
    guestHint: "Är du gäst? Du behöver inget konto för att beställa —",
    guestLink: "skanna QR-koden vid bordet",
  },

  join: {
    metaTitle: "Anslut din restaurang",
    metaDescription:
      "Ta emot beställningar via QR-kod vid bordet och för avhämtning. Egen sida med meny, bilder, öppettider och vägbeskrivning.",

    eyebrow: "För restauranger",
    title: "Anslut din restaurang",
    intro:
      "Egen sida med meny, bilder, öppettider och vägbeskrivning — och beställning direkt från bordet med en QR-kod. Gästen behöver varken app eller konto.",

    /* Kontot sägs före formuläret, inte efter tolv ifyllda fält. */
    accountTitle: "Skapa ett konto först",
    accountBody:
      "Kontot blir ägare till restaurangen och är det vi svarar på. Det tar en halv minut.",
    createAccount: "Skapa konto",
    haveAccount: "Jag har redan ett",

    /* Formuläret. Landet står först och styr resten av fälten. */
    country: "Land",
    countryHelp:
      "Avgör valuta ({currency}), momssatser och tidszon. Går att ändra senare bara genom Burp.",
    name: "Restaurangens namn",
    street: "Gatuadress",
    postalCode: "Postnummer",
    city: "Stad",
    phone: "Telefon",
    email: "E-post",
    description: "Kort presentation",
    optional: "valfritt",
    descriptionPlaceholder: "Vad gör stället speciellt? Två meningar räcker.",
    submit: "Skicka ansökan",
    submitting: "Skickar…",

    doneTitle: "Tack — ansökan är inne.",
    doneBody:
      "Burp går igenom den och hör av sig. Under tiden kan du redan lägga upp menyn och öppettiderna: din restaurang är osynlig för gäster tills den godkänts, så ingenting du gör nu syns utåt i förväg.",
    toDashboard: "Till din dashboard",

    /**
     * Ansökans fel.
     *
     * `validateApplication()` returnerar en KOD och inte en mening, därför att
     * samma regler gäller för backoffice — som är svensk — och för det här
     * formuläret, som talar fem språk. En delad funktion som bar färdig text
     * kunde bara någonsin bära ett av dem.
     *
     * `{label}` är organisationsnumrets lokala namn (JIB, OIB, PIB) och kommer
     * ur `COUNTRY_INFO`. Det översätts aldrig: en restauratör i Zagreb letar
     * efter sitt OIB och inte efter "organisationsnumret".
     */
    errors: {
      nameRequired: "Restaurangen behöver ett namn.",
      countryRequired: "Välj ett land.",
      orgNumberInvalid: "{label} ser inte ut att gälla i {country}.",
      postalCodeInvalid: "Postnumret ser inte ut att gälla i {country}.",
      streetRequired: "Gatuadressen får inte vara tom.",
      cityRequired: "Staden får inte vara tom.",
      emailInvalid: "E-postadressen ser inte ut att stämma.",
      orgNumberTaken:
        "{label} är redan registrerat på en annan restaurang. Har någon hos er redan ansökt?",
      orgNumberFormat: "{label} har fel format för landet.",
    },
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
    searchHint: "Söker i restaurangnamn, beskrivningar och menyer.",
    searching: "Söker…",
    suggestEmpty: "Inget matchar ”{query}”. Tryck Enter för att söka ändå.",
    restaurantHits: "Restauranger",
    cityHits: "Städer",
    dishHits: "Rätter som matchar",
    popularDishes: "Vanligast just nu",
    whereDish: "Var vill du äta {dish}?",
    inCities: "{n} städer",
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

    /*
     * När "Öppet nu" är det enda som tömmer listan.
     *
     * Noll träffar mitt i natten är rätt svar, men "inga restauranger
     * matchade" är fel FRÅGA. Träffarna finns — de är stängda. Skillnaden
     * mellan de två meningarna är skillnaden mellan en återvändsgränd och
     * ett besked, och den kostade en felrapport 2026-08-24.
     *
     * {day} kommer ur `weekday` och behåller sin versal: tyskan skriver
     * veckodagar med stor bokstav.
     */
    closedNowTitle: "Inget är öppet just nu.",
    closedNowNext: "{restaurant} öppnar {time}.",
    closedNowNextOn: "{restaurant} öppnar {day} {time}.",
    closedNowUnknown: "Ingen av träffarna har lagt in några öppettider.",
    showClosedToo: "Visa stängda också",
    showAll: "Visa alla restauranger",

    /* ── Förstaskärmen ──────────────────────────────────────────────────
       Räknaren står i etiketten över rubriken. En marknadsplats som inte
       säger hur mycket som är öppet just nu ser ut att vara tom. */
    openNowCount: "{n} öppna just nu",
    showcaseLabel: "Populärt just nu",

    /* Kartan är ett eget avsnitt sedan hjälten flyttade överst. Den behöver
       därför en rubrik — ett kartfönster utan överskrift läser som en
       annons. */
    mapHeading: "Var de ligger",
    mapHint: "Dra i kartan och sök om i området du tittar på.",

    /* ── Vid bordet ─────────────────────────────────────────────────────
       Det enda på startsidan som förklarar vad Burp gör som ingen annan.
       Tre steg, inga knappar: gästen kan inte skanna en dekal härifrån. */
    howLabel: "Vid bordet",
    howTitle: "Skanna, beställ, ät.",
    howStep1: "Skanna dekalen",
    howStep1Body: "Kameran räcker. Ingen app att ladda ner, inget konto att skapa.",
    howStep2: "Beställ i din egen takt",
    howStep2Body: "Hela menyn med bilder och allergener. Lägg till en omgång till när du vill.",
    howStep3: "Betala när du är klar",
    howStep3Body: "Kort, Apple Pay eller kontant i kassan. Notan ligger kvar i telefonen.",
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
    documents: "Dokument",
    documentsHint: "Öppnas som PDF.",
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
    guestFavourites: "Gästernas favoriter",
    guestFavouritesHint: "Det som beställts oftast här den senaste månaden.",
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
    minQuantity: "Minst {n} portioner",
    suggestionsTitle: "Vill du ha något till?",
    soldOut: "Slut för dagen",
    ongoingOrderLink: "Se status och nota",
    ongoingOrder: "Du har en beställning på gång",
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
    popular: "Populär",
    autoTranslated: "Beskrivningarna är översatta automatiskt.",
    orderNote: "Något vi bör veta?",
    orderNotePlaceholder: "T.ex. nötallergi, eller att ni sitter ute.",
    orderNoteHint: "Går till köket tillsammans med beställningen.",
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

    /**
     * Vägarna vidare från en stängd dörr.
     *
     * "Restaurangen är stängd" var i sig sant och obrukbart: gästen står vid
     * bordet och undrar om hon ska vänta tio minuter eller gå. Nu står
     * klockslaget där, och en väg till restaurangsidan — och till hennes egen
     * nota, om hon har en igång.
     */
    opensAt: "Öppnar {time}.",
    opensOn: "Öppnar {day} {time}.",
    // Ingen dag att lova. Gäller en restaurang utan öppettider alls, och den
    // som väntar på godkännande eller är avstängd.
    noHours: "Öppettiderna står på restaurangens sida.",
    seeRestaurant: "Se restaurangen",
  },

  /**
   * Kvittot och orderns förlopp.
   *
   * Statusetiketterna finns även som `staff.status` längre ned. Att duplicera
   * dem är avsiktligt: gästen läser "Serverad" där personalen läser "Slutförd",
   * därför att gästen beskriver sin mat och personalen sitt arbete. Samma rad i
   * databasen, två läsare, två ordval.
   *
   * De låg fram till 2026-08-21 som `ORDER_STATUS_LABELS` i @burp/core, på
   * svenska. Kärnan känner numera bara nycklarna.
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
    reviewGoogle: "Berätta gärna för fler på Google",
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
    orderMore: "Beställ mer",
    cancelConfirm: "Ja, avbryt",
    cancelKeep: "Behåll",
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

  /**
   * Gästens konto — `/konto` och dess fyra flikar.
   *
   * Ytorna är noindex och ligger utanför språksegmentet. De läser
   * `Accept-Language`, precis som QR-sidan och kvittona: en gäst som just
   * beställt på tyska vid ett bord i Sarajevo ska inte hitta sin
   * orderhistorik på svenska. Att i stället ge dem `/de/konto` hade betytt
   * fem adresser till en sida ingen sökmotor får se.
   *
   * Omdömesformuläret här lånar `receipt.review*` och orderstatusen
   * `receipt.status`. Det är samma handling med samma ord, bara på en annan
   * sida — två uppsättningar hade glidit isär och gett gästen olika ord för
   * samma stjärnor. Statusen lånas INTE från `staff.status`: personalen ser
   * "Slutförd", gästen ser "Serverad", och det är med flit.
   *
   * Skickas till klientkomponenter och måste vara rena strängar rakt igenom.
   */
  /**
   * Bordsbokning.
   *
   * Bordens egenskaper är GRÄNSSNITT och översätts — till skillnad från
   * restaurangens egna texter, som står kvar som de skrivits. Nyckeln kommer ur
   * en fast lista i migration 0054 just därför: en fritext hade betytt att
   * "prozor", "Fenster" och "fönster" är tre olika bord.
   */
  /**
   * Gästens egna matrundor.
   *
   * Det här är HENNES lista, inte ett paket Burp säljer. Skillnaden är
   * juridisk och inte teknisk — se docs/BUSINESS.md — och texterna håller sig
   * därför till att planera, aldrig till att köpa.
   */
  /**
   * Materialet restaurangen publicerar, skrivet till GÄSTERNA.
   *
   * Ligger utanför `staff` med flit. Resten av personalytan följer den
   * inloggades språk, men ett inlägg skrivs till gästerna — och en tysk chef i
   * Sarajevo ska inte råka publicera tyska till bosniska följare. Ytan läser
   * därför restaurangens land, inte `staff.locale`.
   */
  /**
   * Rättsidorna — "punjene paprike Sarajevo".
   *
   * Den enda sökning Burp realistiskt kan vinna: på en stad ensam står Googles
   * karta först, på en rätt i en stad finns oftast ingen sida alls.
   */
  dish: {
    title: "{dish} i {city}",
    meta: "Var får man {dish} i {city}? Se restaurangerna, priserna och menyerna.",
    intro: "{n} restauranger i {city} har {dish} på menyn.",
    fromPrice: "Från {price}.",
    priceTitle: "Vad {dish} kostar",
    otherDishes: "Annat att äta i {city}",
  },

  marketing: {
    posterEyebrow: "Beställ vid bordet",
    posterHeadline: "Skanna. Beställ. Ät.",
    posterBody: "Ingen app. Inget konto. Se menyn i telefonen och beställ direkt.",
    storyHeadline: "Vi finns på Burp",
    storyBody: "Skanna och se hela menyn.",
    whatsapp: "Vi finns nu på Burp — se menyn och beställ direkt i telefonen: {url}",
    instagram:
      "Hela menyn finns nu i telefonen. Skanna koden hos oss eller hitta {name} på Burp. #{city}",
    google:
      "{name} finns nu på Burp: se menyn, öppettiderna och vägen hit, och beställ vid bordet utan app. {url}",
    campaignWELCOME: "Välkommen till {name}",
    campaignWELCOMEBody: "Tack för ditt besök hos oss! Vi ses gärna igen — hela menyn finns i telefonen, och du beställer vid bordet utan app.",
    campaignWE_MISS_YOU: "Vi saknar dig hos {name}",
    campaignWE_MISS_YOUBody: "Det var ett tag sedan sist. Menyn har hunnit ändra sig — titta in och se vad som står på den nu.",
    campaignOFFER: "Ett erbjudande från {name}",
    campaignOFFERBody: "Vi har något på gång den här veckan. Kom förbi och prova — visa det här brevet vid bordet.",
    campaignNEWS: "Nyheter från {name}",
    campaignNEWSBody: "Vi har något nytt att berätta. Läs mer på vår sida hos Burp.",
    campaignFooter: "Du får det här brevet från {name} för att du sagt ja till utskick på Burp. Tacka nej när du vill: {url}",
  },

  routes: {
    intro: "Planera kvällen: förrätt på ett ställe, huvudrätt på nästa.",
    newRoute: "Ny rutt",
    newRoutePlaceholder: "Lördag i Baščaršija",
    create: "Skapa",
    creating: "Skapar…",
    emptyTitle: "Inga rutter än",
    emptyBody: "Skapa en och lägg till ställen från deras sidor.",
    stopCount: "{n} stopp",
    changed: "Ändrad {date}",
    noStops: "Rutten är tom. Lägg till ett ställe från dess sida.",
    addHint: "Lägg till fler ställen från deras egna sidor.",
    saveToRoute: "Spara i en rutt",
    addTo: "Lägg till {name} i en rutt",
    added: "Tillagt.",
    fromPrevious: "{distance} fågelvägen",
    totalDistance: "{distance} totalt, fågelvägen",
    moveUp: "Flytta {name} uppåt",
    moveDown: "Flytta {name} nedåt",
    removeStop: "Ta bort {name}",
    delete: "Ta bort rutten",
    deleteConfirm: "Ta bort rutten? Det går inte att ångra.",
    failed: "Det gick inte. Försök igen.",
  },

  booking: {
    title: "Boka bord",
    intro: "Välj dag, tid och bord. Ni behöver inget konto.",
    date: "Datum",
    partySize: "Antal gäster",
    chooseTime: "Välj tid",
    searching: "Söker lediga tider…",
    noTimes: "Inga lediga tider den dagen. Prova en annan.",
    chooseTable: "Välj bord",
    tableLabel: "Bord {number}",
    standardTable: "Vanligt bord",
    surchargeHint: "Tillägget läggs på notan i restaurangen.",
    name: "Namn",
    phone: "Telefon",
    email: "E-post",
    note: "Något vi bör veta?",
    notePlaceholder: "Barnstol, allergi, födelsedag",
    submit: "Boka",
    submitting: "Bokar…",
    attribute: {
      VIEW: "Utsikt",
      WINDOW: "Vid fönstret",
      OUTDOOR: "Uteservering",
      QUIET: "Lugnt hörn",
      BOOTH: "Bås",
      ACCESSIBLE: "Tillgängligt",
    },
    errorTaken: "Någon hann före. Välj en annan tid.",
    errorPartyTooLarge: "Så stora sällskap bokas per telefon.",
    errorTooSoon: "Tiden ligger för nära. Välj en senare.",
    errorTooFar: "Så långt fram går det inte att boka än.",
    errorNoName: "Skriv namnet bordet ska stå på.",
    errorDisabled: "Restaurangen tar inte emot bokningar just nu.",
    errorUnknown: "Bokningen gick inte igenom. Försök igen.",
    confirmedTitle: "Bordet är bokat",
    confirmedBody: "Vi har inget att skicka er — spara sidan, den är kvittot.",
    yourBooking: "Din bokning",
    partyLabel: "{n} gäster",
    cancel: "Avboka",
    cancelConfirm: "Avboka bordet?",
    cancelled: "Bokningen är avbokad.",
    cancelFailed: "Bokningen kunde inte avbokas.",
    backToRestaurant: "Till restaurangens sida",
    status: {
      BOOKED: "Bokad",
      SEATED: "Ni sitter vid bordet",
      COMPLETED: "Besöket är avslutat",
      CANCELLED: "Avbokad",
      NO_SHOW: "Ingen kom",
    },
  },

  account: {
    label: "Mitt konto",

    /* Toppradens flikar. */
    orders: "Beställningar",
    favorites: "Favoriter",
    routes: "Mina rutter",
    addresses: "Adresser",
    details: "Mina uppgifter",
    logOut: "Logga ut",

    /* Beställningar — startvyn, och det gästen kommer hit för. */
    ordersTitle: "Mina beställningar",
    points: "Poäng",
    pointsExpiring: "{n} poäng går ut inom 30 dagar.",
    /*
     * Det personliga i kontot.
     *
     * Byggt av gästens egen historik och inte av nya frågor till henne. Ett
     * konto som ber om mer för att kännas personligt är inte personligt — det
     * är ett formulär.
     */
    greeting: "Hej {name}",
    greetingNoName: "Välkommen tillbaka",
    since: "Gäst hos Burp sedan {date}",
    firstVisit: "Din första beställning — välkommen.",
    /*
     * Profilbilden.
     *
     * Hjälptexten säger var bilden syns, och det är inte en artighet: bucketen
     * är privat (migration 0067) och bilden visas bara för gästen själv. Den
     * som laddar upp ett ansikte har rätt att veta det innan hon gör det.
     */
    photoTitle: "Din bild",
    photoHint: "Bilden är privat. Den visas för andra först om du själv väljer det nedan.",
    photoShow: "Visa bilden på mina omdömen",
    photoShowHint: "Ett omdöme med ett ansikte väger tyngre. Du kan ta bort valet när du vill.",
    photoPending: "Väntar på granskning. Den visas när Burp tittat på den.",
    photoApproved: "Visas på dina omdömen.",
    photoRejected: "Bilden godkändes inte för publicering. Den är kvar som din privata bild.",
    /*
     * Visningsnamnet.
     *
     * Hjälptexten säger uttryckligen att det riktiga namnet aldrig publiceras.
     * Det är regeln i lib/reviews.ts, och gästen ska kunna lita på den utan
     * att läsa vår kod.
     */
    displayNameTitle: "Ditt namn vid omdömen",
    displayNameHint: "Skrivs ut vid dina omdömen. Lämnar du det tomt står det bara “Gäst”. Ditt riktiga namn publiceras aldrig.",
    displayNameLabel: "Visningsnamn",
    displayNamePlaceholder: "Amina S.",
    displayNameSave: "Spara namnet",
    displayNameSaved: "Namnet är sparat.",
    displayNameTooLong: "Högst 40 tecken.",
    /*
     * Två listor, och rubrikerna får inte byta plats.
     *
     * `alsoSaved` är ett PÅSTÅENDE om vad andra gäster gjort och räknas ur
     * riktiga favoriter. `featured` är Burps eget urval. Att lägga det andra
     * under den första rubriken vore en annons som utger sig för att vara
     * något annat — se migration 0070.
     */
    alsoSaved: "Andra sparade också",
    alsoSavedHint: "Räknat ur vad gäster som sparat samma ställen som du också har sparat.",
    popularHint: "De mest sparade just nu. När du sparat fler ställen blir listan din egen.",
    savedBy: "{n} har sparat",
    savedByOne: "1 har sparat",
    featuredIn: "Utvalda i {city}",
    featuredHint: "Burps eget urval — inte en popularitetslista.",
    photoChoose: "Välj en bild",
    photoRemove: "Ta bort bilden",
    photoUploading: "Laddar upp…",
    photoFormatError: "Bilden måste vara JPEG, PNG, WebP eller AVIF.",
    photoSizeError: "Bilden får vara högst 5 MB.",
    photoFailed: "Bilden kunde inte sparas.",
    yourPlaces: "Dina ställen",
    yourDishes: "Det du beställer oftast",
    visits: "{n} besök",
    visitsOne: "1 besök",
    times: "{n} gånger",
    timesOne: "1 gång",
    ordersEmpty: "Du har inte beställt något än.",
    findRestaurant: "Hitta en restaurang",
    ongoing: "Pågående",
    earlier: "Tidigare",
    atTable: "vid bordet",
    pickup: "avhämtning",
    reviewed: "Du har lämnat omdöme på den här beställningen.",
    reviewPromptAt: "Hur var maten på {restaurant}?",
    reviewNeedsFood: "Välj betyg på maten",

    /* Favoriter. */
    favoritesEmptyTitle: "Inga favoriter än",
    favoritesEmptyBody: "Spara en restaurang så hittar du tillbaka snabbare.",
    browseRestaurants: "Bläddra bland restauranger",
    notAcceptingOrders: "Tar inte emot beställningar just nu.",
    saveFavorite: "Spara som favorit",
    removeFavorite: "Ta bort från favoriter",

    /* Adresser. */
    addressesIntro: "Sparas till leveransbeställningar. Leverans är ännu inte påslaget.",
    addressesEmptyTitle: "Inga sparade adresser",
    addressesEmptyBody: "Lägg till en nedan så slipper du skriva den varje gång.",
    doorCodeShort: "portkod {code}",
    newAddress: "Ny adress",
    addressLabel: "Namn",
    addressLabelPlaceholder: "Hem, Jobb…",
    street: "Gatuadress",
    postalCode: "Postnummer",
    city: "Ort",
    doorCode: "Portkod",
    optional: "valfritt",
    remove: "Ta bort",
    cancel: "Avbryt",
    saving: "Sparar…",
    saveAddress: "Spara adress",

    /* Mina uppgifter — GDPR artikel 15, 17 och 20. */
    exportTitle: "Hämta en kopia",
    marketingTitle: "Utskick",
    marketingBody: "Vi hör av oss ibland med nyheter och erbjudanden. Du kan tacka nej när du vill, och vi skickar ingenting förrän du sagt ja.",
    marketingOn: "Ja tack, skicka utskick till mig",
    marketingSaved: "Sparat.",
    exportBody:
      "Allt Burp har om dig i en fil: ditt konto, dina adresser, alla beställningar med rader, dina omdömen, favoriter, poäng, kuponger och klippkort. Filen är JSON och går att läsa både av dig och av ett annat program.",
    exportButton: "Hämta mina uppgifter",
    deleteTitle: "Radera mitt konto",
    deleteBody:
      "Ditt konto, din profil, dina adresser och dina favoriter tas bort. Det går inte att ångra.",
    remainsTitle: "Det här står kvar, utan dig",
    remainsOrders:
      "Dina beställningar och kvitton, som bokföringsunderlag hos restaurangen. De slutar peka på dig.",
    remainsRatings:
      "Betygen du satt. Texten du skrev och bilden du laddade upp tas bort; siffran står kvar utan avsändare.",
    remainsPoints: "Dina poäng och klippkort försvinner — de går inte att använda av någon.",

    /*
     * Notisväxeln på /konto/uppgifter.
     *
     * Samma texter som personalens i form, olika i innehåll: kocken slår på
     * ett LARM om restaurangens beställningar, gästen ett BESKED om sin egen.
     * Att dela strängar mellan dem hade sparat rader och gjort båda otydliga.
     */
    pushTitle: "Notiser om dina beställningar",
    pushBody: "Få veta när restaurangen tagit emot din avhämtning och när maten står klar. Brevet kommer ändå — det här är för dig som hellre får en pling i telefonen.",
    pushNotConfigured: "Notiser är inte påslagna för Burp än. Du får dina besked som brev.",
    pushUnsupported: "Den här webbläsaren kan inte ta emot notiser. På iPhone fungerar det när Burp lagts till på hemskärmen.",
    pushBlocked: "Notiser är blockerade för Burp i den här webbläsaren. Det går bara att ändra i webbläsarens egna inställningar — vi kan inte fråga igen.",
    pushEnable: "Slå på för den här enheten",
    pushDisable: "Stäng av på den här enheten",
    pushOnHint: "Den här enheten pling:ar när din beställning ändrar status.",
    pushOffHint: "Varje enhet måste slås på för sig. Har du både telefon och dator gör du det på båda.",
    pushFailed: "Notiserna kunde inte slås på.",
    pushIncomplete: "Webbläsaren gav ingen fullständig prenumeration. Försök igen.",
    deleteConfirmTitle: "Är du säker?",
    deleteConfirmBody:
      "Skriv {word} för att bekräfta. Hämta gärna en kopia av dina uppgifter först — efteråt går det inte.",
    deleteConfirmLabel: "Skriv {word} för att bekräfta",
    deleting: "Raderar…",
    deleteForever: "Radera för alltid",

    /* Kvittot på raderingen. Egen sida — kontosidan går inte längre att nå. */
    erasedTitle: "Kontot är raderat",
    erasedBody:
      "Din profil, dina adresser och dina favoriter är borta, och ingenting hos oss pekar längre ut dig. Beställningarna finns kvar hos restaurangerna som bokföringsunderlag, utan koppling till dig.",
    erasedAgain: "Du kan beställa igen när du vill — vid bordet behövs inget konto alls.",
    toHome: "Till startsidan",

    errors: {
      mustBeLoggedIn: "Du måste vara inloggad.",
      saveFailed: "Kunde inte spara. Försök igen.",
      favoritesNeedAccount: "Du måste vara inloggad för att spara favoriter.",
      favoriteFailed: "Kunde inte spara.",
      reviewUnreadable: "Betyget kunde inte tolkas. Välj minst ett betyg på maten.",
      orderNotFound: "Beställningen hittades inte.",
      reviewNotCompleted: "Du kan lämna omdöme först när beställningen är klar.",
      addressFieldsRequired: "Fyll i gata, postnummer och ort.",
      // Fem siffror i Bosnien, Kroatien och Sverige; fem eller sex i Serbien.
      // Adressen bär inget land — se `saveAddress` för varför.
      postalCodeDigits: "Postnumret ska vara fem eller sex siffror.",
      addressRemoveFailed: "Kunde inte ta bort adressen.",
      confirmWord: "Skriv {word} för att bekräfta.",
      eraseFailed: "Kontot kunde inte raderas.",
    },
  },

  /**
   * Breven till gästen.
   *
   * Enda texten i produkten som skrivs när gästen INTE tittar. Språket kan
   * därför inte läsas ur en header — det ligger fryst på ordern som
   * `guest_locale`, satt när hon beställde. Se migration 0049.
   *
   * Kort med flit. Ett brev om att maten är klar läses på en telefon i
   * gånghastighet, och allt utom klockslaget och restaurangens namn är i
   * vägen.
   */
  email: {
    acceptedSubject: "{restaurant} har tagit emot din beställning",
    acceptedBody: "Maten är klar om ungefär {n} minuter.",
    // Utan tid. Restaurangen tog emot ordern utan att säga när — bättre att
    // säga inget än att hitta på ett klockslag.
    acceptedBodyNoTime: "Restaurangen har tagit emot din beställning.",

    readySubject: "Din beställning är klar att hämtas",
    readyBody: "{restaurant} har din beställning klar.",

    viewOrder: "Se din beställning",
    footer: "Du får det här brevet för att du beställt för avhämtning via Burp.",

    /*
     * Inbjudan till en nyanställd.
     *
     * Brevet går till någon som ännu inte har ett konto och därför inget
     * språkval. Det skrivs på restaurangens landsspråk — inte på den
     * inbjudandes: en ägare som satt gränssnittet till svenska ska inte
     * skicka ett svenskt brev till en kock i Sarajevo.
     *
     * {role} fylls med ordbokens egen stavning, med versal. Tyskan skriver
     * substantiv så, och en gemen "koch" är ett stavfel.
     */
    invitationSubject: "Du har blivit inbjuden till {restaurant} på Burp",
    invitationHeading: "Välkommen till {restaurant}",
    invitationBody: "{restaurant} har bjudit in dig som {role}.",
    invitationOpenLink: "Öppna länken för att komma igång:",
    invitationCta: "Kom igång",
    invitationExpiry: "Länken gäller i sju dagar och bara för den här adressen.",
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

  /**
   * Personalytorna.
   *
   * Ett val per anställd, aldrig `Accept-Language`: köket ska inte byta språk
   * för att en gäst gjorde det. Språket ligger på `staff.locale` (migration
   * 0047) och följer personen mellan surfplattan i köket och telefonen i
   * fickan.
   *
   * Etiketterna här ersätter `STAFF_ROLE_LABELS`, `ORDER_STATUS_LABELS`,
   * `PAYMENT_PROVIDER_LABELS` och `WEEKDAY_LABELS` som låg på svenska i
   * `@burp/core`. Kärnan får inte importera i18n-modulen — den känner numera
   * bara nycklarna, och orden står här.
   *
   * `status` finns ALLTID i två uppsättningar: den här och `receipt.status`.
   * Det är avsiktligt och inte slarv. Gästen läser "Serverad" när personalen
   * läser "Slutförd", därför att gästen beskriver sin mat och personalen sitt
   * arbete. Samma rad i databasen, två läsare, två ordval.
   *
   * ENBART strängar — objektet passerar till klientkomponenter.
   */
  staff: {
    home: "Burp — till startsidan",
    navLabel: "Personalytans navigering",
    logOut: "Logga ut",
    language: "Språk",
    languageSaving: "Sparar…",
    languageError: "Kunde inte spara språket. Försök igen.",

    role: {
      owner: "Ägare",
      manager: "Chef",
      staff: "Personal",
      kitchen: "Kock",
    },

    section: {
      oversikt: "Översikt",
      order: "Beställningar",
      kok: "Köksskärm",
      kassa: "Kassa",
      meny: "Meny",
      bord: "Bord & QR",
      bokningar: "Bokningar",
      erbjudanden: "Erbjudanden",
      marknadsforing: "Marknadsföring",
      omdomen: "Omdömen",
      statistik: "Statistik",
      avrakning: "Avräkning",
      handelser: "Händelser",
      personal: "Personal",
      installningar: "Inställningar",
      sakerhet: "Din inloggning",
    },

    status: {
      DRAFT: "Utkast",
      PLACED: "Lagd",
      ACCEPTED: "Mottagen",
      PREPARING: "Tillagas",
      READY: "Klar",
      COMPLETED: "Slutförd",
      CANCELLED: "Avbruten",
      REFUNDED: "Återbetald",
    },

    /*
     * STRIPE och MONRI säger båda bara "Kort".
     *
     * Vilken inlösare som råkade ta emot betalningen är Burps sak och inte
     * personalens. Det som skiljer i kassan är om pengarna finns i lådan
     * (CASH), gick genom restaurangens egen terminal (TERMINAL) eller drogs
     * i gästens telefon — och den sista skillnaden syns när något ska
     * betalas tillbaka, inte när notan läses.
     */
    provider: {
      CASH: "Kontant",
      TERMINAL: "Kort i terminal",
      GIFT_CARD: "Presentkort",
      STRIPE: "Kort",
      MONRI: "Kort",
    },

    /**
     * Köksskärmen och Order live.
     *
     * ENBART strängar. Objektet skickas i sin helhet till `KitchenBoard`, som
     * är klientkod — en funktion här ger 500 vid rendering, och felpayloaden
     * innehåller ändå texterna, så ett grep av HTML:en ser ut att bekräfta att
     * sidan fungerar. Ett test kräver det.
     */
    kitchen: {
      live: "Order live",
      sound: "Ljud",
      soundOn: "på",
      soundOff: "av",
      empty: "Inga aktiva beställningar.",
      updateFailed: "Kunde inte uppdatera order: {message}",
      sibling: "Beställning {index} av {count} på bordet",
      minutes: "{n} min",

      /*
       * Knappen bär NÄSTA steg, inte nuvarande status.
       *
       * Nycklarna är den status knappen leder TILL, så att `NEXT_STEP` i
       * köksskärmen slår upp direkt utan en tabell emellan.
       */
      /**
       * Knappraden köket får när ordern tas emot.
       *
       * "Klart om" och inte "Tillagningstid": kocken svarar på när gästen kan
       * äta, inte på hur länge spisen går. Skillnaden syns när tre order står
       * på kö — svaret är då längre än tillagningen, och det är det längre
       * svaret gästen ska få.
       */
      prepTime: "Klart om",
      prepMinutes: "{n} min",

      stepACCEPTED: "Ta emot",
      stepPREPARING: "Börja laga",
      stepREADY: "Klar",
      stepCOMPLETED: "Serverad",

      reject: "Avvisa",
      rejectConfirm: "Avvisa ordern",
      cancel: "Avbryt",

      upcomingTitle: "Kommande",
      upcomingHint: "Släpps till köket när tillagningstiden återstår.",
    },

    /**
     * Hur många förbeställningar som ligger senare i dag.
     *
     * En funktion och inte en sträng med `{n}`, därför att räkneordet böjer
     * substantivet olika i olika språk. Bosniskan har TRE former — en för 1,
     * 21, 31…, en för 2–4 och en för 5 och uppåt — och en mall med två skulle
     * vara fel på de flesta tal. Varje språk skriver sin egen regel här.
     *
     * Funktioner går inte att serialisera över server/klient-gränsen, så den
     * här får aldrig hamna i `kitchen` ovan. Den läses av sidorna, som
     * renderas på servern.
     */
    /**
     * Vad en order ÄR — bord, avhämtning eller leverans.
     *
     * Eget avsnitt därför att både köksskärmen och kassan skriver samma sak.
     * Två uppsättningar hade betytt att biljetten kan säga "Avhämtning" medan
     * notan säger något annat om exakt samma order. Nycklarna är enumets egna
     * värden, så uppslaget går direkt.
     *
     * ENBART strängar — skickas till klientkomponenter.
     */
    orderType: {
      table: "Bord {number}",
      TABLE: "Bord",
      PICKUP: "Avhämtning",
      DELIVERY: "Leverans",
    },

    /**
     * Kassan.
     *
     * ENBART strängar. Objektet skickas i sin helhet till `CashRegister`, som
     * är klientkod.
     */
    register: {
      toSettle: "Att kvittera",
      emptyTitle: "Allt är kvitterat",
      emptyBody: "Varje slutförd order det senaste dygnet har en registrerad betalning.",
      paidToday: "Betalt i dag",
      paidTodayHint:
        "Facit över passet, kontanter och kort. Raderna går inte att ändra — en felkvittering rättas med en motbokning, inte genom att skriva om historien.",

      onSameBill: "{count} på samma nota",
      alreadyPaid: "{paid} redan betalt av {total}",
      showOrders: "Visa beställningarna",
      hideOrders: "Dölj beställningarna",

      amountReceived: "Mottaget belopp",
      method: "Betalsätt",
      settle: "Kvittera",
      settleTable: "Kvittera hela bordet",
      settling: "Kvitterar…",
      settleFailed: "Kvitteringen gick inte igenom.",

      closeBill: "Stäng notan utan att kvittera",
      closeConfirm:
        "Stäng notan utan att kvittera något? Ordrarna ligger kvar och går att kvittera var för sig.",
      closeFailed: "Notan kunde inte stängas.",

      over: "Över notan med",
      under: "Under notan med",
      spreadHint: "Fördelas på bordets beställningar i proportion till vad var och en kostar.",
      asEntered: "Registreras som det står — avrundning och rabatt i lokalen ska synas.",
      unreadableAmount: "Beloppet gick inte att tolka.",

      servedAt: "Serverad {when}",
      paidOfTotal: "{paid} betalt av {total}",
      billTotal: "notan {total}",
      refundedAmount: "återbetalt {amount}",
      remaining: "kvar {amount}",

      refund: "Betala tillbaka",
      refunding: "Betalar tillbaka…",
      refundFailed: "Återbetalningen gick inte igenom.",
      refundAmount: "Belopp",
      refundReason: "Varför",
      refundReasonPlaceholder: "T.ex. kall soppa",
      refundTooMuch: "Mer än vad som återstår ({amount}).",
      cancel: "Avbryt",

      refundHintGIFT_CARD: "Värdet läggs tillbaka på presentkortet, inte i kassan.",
      refundHintCASH: "Registreras som en motbokning. Sedlarna lämnar ni tillbaka över disk.",
      refundHintTERMINAL:
        "Registreras som en motbokning. Återbetalningen gör ni i terminalen — Burp når den inte.",
      refundHintPROVIDER: "Går tillbaka till gästens kort via leverantören. Kan ta några dagar.",

      intro:
        "Slutförda order från det senaste dygnet. Ett bordssällskap står som en nota och kvitteras i ett svep; beloppet fördelas på beställningarna åt er. Kortbetalda order är redan kvitterade av leverantören.",
      tipsTitle: "Dricks att fördela",
      tipsCash: "{amount} kontant",
      tipsCard: "{amount} via kort",
      tipsPending: "{amount} på notor som inte betalats än",
      tipsPeriod: "Senaste dygnet",
      tipsHint:
        "Dricksen är personalens pengar och ingår varken i omsättningen eller i Burps avgift. En nota som lämnats tillbaka räknas inte.",
    },

    /**
     * Översikten på `/dashboard` — den första ytan alla utom kocken möter.
     *
     * Kolumnrubrikerna över köets biljetter stod tidigare som egna ord: "Ny",
     * "Accepterad". Det gav TVÅ namn på samma status, eftersom köksskärmen
     * samtidigt kallade dem "Lagd" och "Mottagen". Två namn på ett tillstånd
     * är inte en nyansskillnad utan en fråga personalen får ställa varandra,
     * och de läser båda skärmarna samma pass. Kolumnerna läser nu `status`
     * ovan, precis som köksskärmen.
     *
     * ENBART strängar — skickas till klientkomponenter.
     */
    overview: {
      statOrders: "Order i dag",
      statRevenue: "Omsättning i dag",
      statAverage: "Snitt per order",
      statTips: "Dricks i dag",
      statTipsHint: "personalens, inte restaurangens",

      inKitchen: "Just nu i köket",

      editPlan: "Rita om lokalen",
      allOrders: "Alla beställningar",
      noOrdersTitle: "Inga beställningar just nu",
      noOrdersBody: "Nya order dyker upp här så fort en gäst skickar dem.",

      tables: "Bord",
      tablesBusy: "{busy} av {total} upptagna",
      noTablesTitle: "Inga bord upplagda",
      noTablesBody: "Lägg upp borden för att kunna skriva ut QR-dekaler.",
      noTablesAction: "Lägg upp bord",

      /*
       * Bordets fyra tillstånd.
       *
       * Låg som två kopior — en i översikten, en i planritningen — och de
       * kunde alltså säga olika saker om samma färgade ruta.
       */
      stateLEDIGT: "Ledigt",
      stateOPPEN_NOTA: "Öppen nota",
      stateBESTALLNING: "Beställning inne",
      stateSERVERAS: "Klar att servera",
    },

    /* Bordets nota. Servitören klickade på ett bord i översikten. */
    tableView: {
      back: "Till översikten",
      emptyTitle: "Bordet är tomt",
      emptyBody: "Ingen öppen nota just nu. Beställningarna dyker upp här så fort en gäst skannat QR-koden vid bordet.",
      ordersTitle: "Beställningar",
      placed: "Lagd {time}",
      total: "Summa",
      paid: "Betalt",
      due: "Kvar att betala",
      notCounted: "Räknas inte in i notan.",
      openReceipt: "Öppna i kassan",
    },

    /* Personalsidan. ENBART strängar — skickas till klientkomponenter. */
    staffAdmin: {
      intro: "Vem som arbetar här, med vilken roll, och vem som är inbjuden men inte kommit in än.",
      actionFailed: "Åtgärden gick inte igenom.",

      inviteTitle: "Bjud in någon",
      inviteHint:
        "Personen får en länk som gäller i sju dagar och bara för den adress du skriver här.",
      email: "E-postadress",
      emailPlaceholder: "namn@exempel.se",
      role: "Roll",
      invite: "Bjud in",

      inviteCreated: "Inbjudan skapad",
      inviteSendYourself: "Ett brev är på väg. Du kan också skicka länken själv:",
      copy: "Kopiera",
      copied: "Kopierad",

      pendingTitle: "Väntar på svar",
      validUntil: "gäller till {date}",
      revoke: "Återkalla",

      membersTitle: "Personal",
      you: "(du)",
      ended: "avslutad",
      end: "Avsluta",
      resume: "Återuppta",
    },

    /**
     * Restaurangens inställningar: presentation, öppettider, kortbetalning,
     * notiser, klippkort och orderregler.
     *
     * Personalhanteringen låg också här till 2026-08-21 och gjorde det två
     * gånger — se `/dashboard/personal`.
     *
     * ENBART strängar — varje redigerare på sidan är klientkod.
     */
    marketing: {
      intro: "Färdigt material att publicera själv.",
      languageNote: "Texterna nedan är på {language} — språket era gäster läser.",
      posterTitle: "Affisch",
      posterHint: "A5. Skriv ut och sätt i fönstret eller vid kassan.",
      print: "Skriv ut",
      storyTitle: "Ruta för story",
      storyHint: "Fotografera skärmen med telefonen som ska publicera den.",
      textsTitle: "Texter",
      textsHint: "Klistra in som de är, eller skriv om dem så att de låter som ni.",
      whatsapp: "WhatsApp och Viber",
      instagram: "Instagram och TikTok",
      google: "Google-profilen",
      googleHint:
        "Google-profilen är er egen. Burp kan inte publicera där — ingen får det — men texten är skriven.",
      copy: "Kopiera",
      copied: "Kopierat",
    },
    bookings: {
      intro: "Dagens och veckans bord.",
      disabled: "Bokning är avstängd. Slå på den i inställningarna.",
      empty: "Inga bokningar den närmaste veckan.",
      party: "{n} gäster",
      table: "Bord {number}",
      released: "Karensen har gått — bordet är bokningsbart igen",
      seat: "Kom",
      noShow: "Kom inte",
      cancel: "Avboka",
      complete: "Klart",
      confirm: "Är du säker? Det går inte att ångra.",
      failed: "Ändringen gick inte igenom.",
      bookingFailed: "Bokningen gick inte igenom.",
    },
    settings: {
      identityTitle: "Ert märke",
      identityHint:
        "Logotyp, banner och en färg som är er. Knappar och priser följer Burps form — det är maten som ska sticka ut, inte gränssnittet.",
      accentTitle: "Accentfärg",
      accentHint:
        "En färg som används till band och märken på er sida. Den prövas mot både ljust och mörkt läge innan den sparas.",
      accentColor: "Färg",
      accentPreview: "Så här ser den ut",
      accentContrast: "Kontrast: {text}:1 för texten, {light}:1 mot ljus yta, {dark}:1 mot mörk.",
      accentSaved: "Färgen är sparad.",
      logoTitle: "Logotyp",
      logoHint: "Visas överst på er sida. Granskas av Burp innan den publiceras.",
      logoUpload: "Ladda upp logotyp",
      bannerTitle: "Banner",
      bannerHint: "Ett brett band överst på sidan. Granskas av Burp innan det publiceras.",
      bannerUpload: "Ladda upp banner",
      googleTitle: "Omdömen på Google",
      googleHint:
        "Gästen som lämnat ett omdöme här får frågan om hon vill säga samma sak på Google. Burp skickar aldrig omdömen dit — Google tar inte emot dem.",
      googleUrl: "Länk till ert recensionsformulär",
      googleUrlHint:
        "Hämtas i er Google-profil under Be om recensioner. Lämna tomt för att inte fråga alls.",
      reservationTitle: "Bordsbokning",
      reservationHint:
        "Gäster bokar bord på er sida. Lediga tider räknas ur era öppettider — sätt dem först.",
      reservationEnabled: "Ta emot bokningar",
      reservationEnabledHint: "Avstängd visas inget bokningsformulär för gästen.",
      reservationDuration: "Bordstid",
      reservationDurationHint: "Minuter per bokning.",
      reservationGrace: "Karens",
      reservationGraceHint: "Minuter ni håller bordet för den som är sen.",
      reservationLead: "Framförhållning",
      reservationLeadHint: "Minuter innan bokning stängs.",
      reservationHorizon: "Bokningsbart",
      reservationHorizonHint: "Dagar framåt.",
      reservationMaxParty: "Största sällskap",
      reservationMaxPartyHint: "Fler än så ringer er.",
      hoursTitle: "Öppettider",
      hoursHint:
        "Gäster kan bara beställa när ni är öppna. Flera pass per dag för lunch och kväll. Stänger ni efter midnatt skriver ni sluttiden som den är — 22:00 till 02:00 betyder att ni har öppet till två på natten.",
      cardTitle: "Kortbetalning",
      cardHint:
        "Gästen betalar i sin egen telefon. Avtalet är ert, inte Burps — pengarna går rakt in på ert konto.",
      notifyTitle: "Notiser",
      notifyHint:
        "Köksskärmen låter redan när den är öppen. Det här är för när den inte är det — notisen kommer fram i telefonen även om ingen sitter framför skärmen.",
      punchTitle: "Klippkort",
      punchHint: "Tionde besöket bjuder ni på. Räknar besök, inte belopp.",
      mfaTitle: "Tvåstegsverifiering",
      mfaHint:
        "En kod ur din telefon utöver lösenordet. Utan den räcker ett läckt lösenord för att nå menyn, priserna, orderhistoriken och avräkningen.",
      mfaStatusOn: "Tvåstegsverifiering är på",
      mfaStatusOff: "Bara lösenord skyddar kontot",
      mfaEnable: "Slå på tvåstegsverifiering",
      mfaScanHint:
        "Skanna rutan med Google Authenticator, 1Password eller en annan autentiseringsapp.",
      mfaSecretHint: "Kan du inte skanna? Skriv in nyckeln i appen:",
      mfaCodeLabel: "Kod från appen",
      mfaVerify: "Bekräfta",
      mfaCancel: "Avbryt",
      mfaDisable: "Stäng av",
      mfaDisableConfirm:
        "Stäng av tvåstegsverifieringen? Kontot skyddas då bara av sitt lösenord.",
      mfaEnabled: "Klart. Nästa inloggning frågar efter en kod.",
      /*
     * Skilj "avstängt för hela Burp" från "det gick inte just nu".
     *
     * Supabase har TOTP avstängt som standard, och svarar då
     * `mfa_totp_enroll_not_enabled`. Panelen visade förut samma allmänna
     * felmeddelande som för ett nätverksfel, och just därför låg funktionen
     * död från 2026-08-22 till 2026-09-01 utan att någon kunde se varför.
     *
     * Den som läser det här kan inte åtgärda det själv — det är en
     * projektinställning — så texten ber hen höra av sig i stället för att
     * försöka igen.
     */
    mfaNotEnabled:
      "Tvåstegsverifiering är inte påslagen för Burp än. Hör av dig till oss så ordnar vi det.",
    mfaFailed: "Det gick inte. Försök igen.",
      mfaCodeFailed:
        "Koden stämmer inte. Kontrollera att telefonens klocka går rätt och försök igen.",
      mfaLoading: "Läser inloggningen…",
      policyTitle: "Orderregler",
      policyHint: "Vad gästen får ändra efter att beställningen lagts, och hur länge.",

      saving: "Sparar…",
      save: "Spara",
      saveFailed: "Kunde inte spara.",
      somethingWrong: "Något gick fel.",
      saved: "Sparat.",

      hoursSaved: "Öppettiderna är sparade.",
      nextDay: "nästa dag",
      remove: "Ta bort",
      openThisDay: "Öppna den här dagen",
      addShift: "Lägg till pass",
      closedAllDay: "Stängt hela dagen",
      saveHours: "Spara öppettider",
      nothingToSave: "Inget att spara",

      policySaved: "Orderreglerna är sparade.",
      autoAccept: "Ta emot beställningar automatiskt",
      autoAcceptHint: "Utan detta måste någon trycka Ta emot på varje order innan köket ser den.",
      prepTime: "Tillagningstid",
      prepTimeUnit: "minuter",
      prepTimeHint: "Används för att uppskatta väntetid åt gästen.",
      editWindow: "Ändringsfönster",
      editWindowUnit: "sekunder",
      editWindowHint:
        "Hur länge efter beställning gästen får ändra innehållet. 0 stänger av ändringar helt.",
      editUntil: "Ändring tillåts till och med",
      editUntilHint: "Efter den här statusen kan gästen inte längre ändra.",
      mayAdd: "Gästen får lägga till rätter",
      mayRemove: "Gästen får ta bort rätter",
      mayChangeOptions: "Gästen får byta tillval",
      cancelUntil: "Avbokning tillåts till och med",
      cancelUntilHint:
        "Avbokning styrs av status, inte av ändringsfönstret — en gäst ska kunna avboka så länge maten inte påbörjats.",
      scheduled: "Ta emot förbeställningar",
      scheduledHint:
        "Gästen väljer en tid i förväg. Ordern släpps till köket tillagningstiden innan.",

      punchCard: "Klippkort",
      punchCardBody:
        "Efter ett visst antal besök bjuder ni på måltiden. Räknar besök och inte belopp — en kaffe räknas lika mycket som en trerätters, vilket är vad som får folk att komma tillbaka.",
      visits: "Antal besök",
      cap: "Tak",
      capPlaceholder: "hela notan",
      capHint: "Max att bjuda på, i {currency}. Tomt = hela notan.",
      loggedInOnly:
        "Gäller bara inloggade gäster. En bordsgäst som beställer anonymt går inte att räkna besök på — och ska inte gå att räkna besök på.",

      pushNotConfigured:
        "Notiser är inte påslagna för plattformen än. Köksskärmens ljud fungerar som vanligt.",
      pushUnsupported:
        "Den här webbläsaren kan inte ta emot notiser. På iPhone fungerar det när Burp lagts till på hemskärmen.",
      pushBlocked:
        "Notiser är blockerade för Burp i den här webbläsaren. Det går bara att ändra i webbläsarens egna inställningar — vi kan inte fråga igen.",
      pushEnable: "Slå på för den här enheten",
      pushDisable: "Stäng av på den här enheten",
      pushOnHint: "Den här enheten larmar när en beställning kommer in.",
      pushOffHint:
        "Varje enhet måste slås på för sig. Har du både telefon och surfplatta gör du det på båda.",
      pushFailed: "Notiserna kunde inte slås på.",

      cardOnTitle: "Kortbetalning är på",
      cardOnBody:
        "Gäster kan betala med kort, Apple Pay och Google Pay direkt i menyn. Pengarna går till ert eget konto hos {provider} — Burp tar aldrig emot dem. Vår avgift dras ur betalningen.",
      cardPendingTitle: "Väntar på {provider}",
      cardPendingBody:
        "Kontot är skapat men {provider} har inte godkänt det ännu. Det är därför kortknappen inte syns för gästerna. Saknas något underlag ligger det i deras formulär.",
      cardDisabledTitle: "Kortbetalning är avstängd",
      cardDisabledBody:
        "Gäster betalar på plats. Kontot hos {provider} finns kvar och går att slå på igen.",
      cardConnectTitle: "Ta emot kort i menyn",
      cardConnectBody:
        "Gästen betalar i sin egen telefon vid bordet, med kort, Apple Pay eller Google Pay. Ni tecknar avtalet direkt med leverantören och pengarna går rakt in på ert konto — Burp håller aldrig gästens pengar.",
      cardUnavailableTitle: "Kortbetalning är inte tillgänglig än",
      cardUnavailableBody:
        "Ingen leverantör är kopplad för {currency} ännu. Gästen beställer som vanligt och betalar på plats; ni kvitterar summan i Kassan.",
      cardContinue: "Fortsätt hos leverantören",
      cardConnect: "Koppla konto",
      cardTurnOff: "Stäng av",
      cardTurnOffConfirm: "Stäng av kortbetalning? Gäster kan då bara betala på plats.",
      cardTurnedOff: "Kortbetalning avstängd.",
      cardOwnerOnly: "Bara ägaren kan koppla ett betalkonto.",

      pageTitle: "Din sida",
      pageHint: "Så här ser din restaurang ut för gästerna.",
      showPage: "Visa sidan",
      presentation: "Presentation",
      presentationPlaceholder: "Vad gör stället speciellt? Två meningar räcker.",
      presentationCount: "{n}/600 tecken. Syns överst på din sida och i sökresultat.",
      hero: "Huvudbild",
      heroHint: "Visas överst på din sida och i listorna. Burp granskar bilden innan den publiceras.",
      heroUpload: "Ladda upp huvudbild",
      phone: "Telefon",
      cuisines: "Kökstyper",
      cuisinesHint: "Kommaseparerat, högst åtta. Blir filter och egna sidor på Burp.",
      priceTier: "Prisklass",
      priceTierHint: "Klicka igen för att ta bort. Utan prisklass visas ingen alls.",
      address: "Adress",
      street: "Gatuadress",
      postalCode: "Postnummer",
      city: "Stad",
      mapPlace: "Plats på kartan",
      mapHint:
        "Öppna ditt ställe i Google Maps och klistra in länken här. Nålen styr vägbeskrivningen gästerna får — adressen ovan används bara som text.",
      mapLinkLabel: "Kartlänk eller koordinater",
      mapCurrentHint: "Kartan visar den plats som är sparad nu. Den uppdateras när du sparat en ny länk.",
      presentationSaved: "Sparat. Ändringarna syns på din sida inom en timme.",
      cuisinesPlaceholder: "Grill, Bosniskt",
      mapLinkPlaceholder: "https://maps.google.com/… eller 43.8595, 18.4287",
      challengeStep: "Steg två",
      challengeTitle: "Verifiera",
      challengeIntro: "Öppna din autentiseringsapp och skriv in den sexsiffriga koden för Burp.",
      challengeCode: "Engångskod",
      challengeSubmit: "Verifiera",
      challengeSubmitting: "Verifierar…",
      challengeNoFactor: "Ingen andra faktor är registrerad på kontot. Ladda om sidan.",
      challengeWrongCode: "Koden stämmer inte. Kontrollera att telefonens klocka går rätt och försök igen.",
      challengeLost: "Har du bytt telefon och inte längre tillgång till koden? Kontakta Burp — vi kan ta bort din andra faktor, och det loggas.",
      challengeLogOut: "Logga ut",
    },

    /**
     * Menyredigeraren.
     *
     * `day*`-nycklarna står i JavaScripts veckoordning — söndag först —
     * eftersom `menus.active_days` bär samma tal som `Date.getDay()`.
     * Ordningen är alltså datans, inte veckans, och det är därför de inte
     * går att slå upp i ordbokens `weekday` längre ned.
     *
     * ENBART strängar — redigeraren är klientkod.
     */
    menu: {
      intro: "Bara publicerade menyer och rätter syns för gästen. Priser anges inklusive moms.",
      noMenuTitle: "Ingen meny ännu",
      noMenuBody:
        "Skapa den första ovan. En restaurang kan ha flera menyer — lunch, kväll, helg — och rätt meny visas efter veckodag och klockslag.",

      newMenu: "Ny meny",
      newMenuPlaceholder: "Lunch, Kväll, Helg…",
      createMenu: "Skapa meny",
      creating: "Skapar…",
      publish: "Publicera",
      unpublish: "Avpublicera",
      deleteAll: "Radera allt",
      confirm: "Bekräfta",
      cancel: "Avbryt",
      remove: "Radera",

      appliesOn: "Gäller",
      from: "Från",
      to: "Till",
      daySun: "Sön",
      dayMon: "Mån",
      dayTue: "Tis",
      dayWed: "Ons",
      dayThu: "Tors",
      dayFri: "Fre",
      daySat: "Lör",

      newCategory: "Ny kategori",
      newCategoryPlaceholder: "Pizza, Dryck, Efterrätt…",
      removeCategory: "Ta bort kategori",
      add: "Lägg till",
      adding: "Lägger till…",

      newItem: "Ny rätt",
      price: "Pris ({currency})",
      itemName: "Rättens namn",
      inStock: "I lager",
      soldOutToday: "Slut för dagen",
      hide: "Dölj",
      details: "Detaljer",
      description: "Beskrivning",
      vat: "Moms",
      allergens: "Allergener",
      allergensHint: "klicka för att märka rätten",
      image: "Bild",
      imageHint:
        "Bilden syns för gästen först när Burp godkänt den. JPEG, PNG, WebP eller AVIF, högst 10 MB.",
      imagePending: "Väntar på granskning: {n}",
      imageUploadFor: "Ladda upp bild för {name}",
      removeItem: "Ta bort rätten",

      optionGroups: "Tillvalsgrupper",
      newGroup: "Ny grupp",
      newGroupPlaceholder: "Välj storlek",
      min: "Minst",
      max: "Högst",
      addGroup: "Lägg till grupp",
      removeGroup: "Ta bort grupp",

      somethingWrong: "Något gick fel.",
      makeAvailable: "Gör tillgänglig igen",
      soldUntil: "Slut till",
      reasonForGuest: "Skäl för gästen",
      reasonPlaceholder: "T.ex. Slut till fredag",
      drinksCategory: "Dryck",
      minQuantity: "Minsta antal",
      minQuantityHint: "1 = ingen gräns. Höj för det som lagas i sats.",
      upsell: "Föreslå till den här",
      upsellHint: "Syns i kundvagnen när rätten ligger i den.",
      upsellAdd: "Lägg till ett förslag…",
      upsellRemove: "Ta bort förslaget {name}",
      markSoldOut: "Markera slut",
      menuName: "Menyns namn",
      categoryName: "Kategorins namn",
      newOption: "Nytt tillval",
      allDayHint: "Tomt = hela dagen. En meny med tidsfönster vinner över en utan.",
    },

    /**
     * Bord, QR-koder och planritningen.
     *
     * "Öppen nota" står INTE här. Det är samma tillstånd som i översiktens
     * teckenförklaring och läses ur `overview.stateOPPEN_NOTA` — två nycklar
     * för samma sak är två som kan glida isär, och gästen vid bordet bryr sig
     * inte om vilken sida personalen råkar titta på.
     *
     * ENBART strängar — skickas till klientkomponenter.
     */
    tables: {
      title: "Bord och QR-koder",
      intro: "Skriv ut koden och sätt den på bordet. Koden är statisk och behöver aldrig bytas.",
      emptyTitle: "Inga bord ännu",
      emptyBody:
        "Lägg till det första ovan. Varje bord får en egen QR-kod att skriva ut och sätta på bordet.",

      tableNumber: "Bordsnummer",
      zone: "Zon",
      optional: "valfritt",
      zonePlaceholder: "Uteservering",
      seats: "Platser",
      seatsCount: "{n} platser",
      addTable: "Lägg till bord",
      adding: "Lägger till…",

      bookingTitle: "Vid bokning",
      bookingSaved: "Bordet är sparat.",
      surcharge: "Tillägg",
      surchargeHint: "Läggs på notan hos er. Burp tar aldrig emot beloppet.",
      printAll: "Skriv ut alla koder",
      locked: "Låst",
      lock: "Lås bordet",
      unlock: "Lås upp",
      confirm: "Bekräfta",
      cancel: "Avbryt",
      remove: "Ta bort",
      statusFailed: "Kunde inte ändra bordets status.",

      planTitle: "Planritning",
      planHint:
        "Dra ut borden så att de står som i lokalen. Översikten visar dem sedan i rummets form i stället för som ett rutnät — en servitör ser då vilket bord som ropar, inte vilken ruta i ordningen.",
      planEmptyTitle: "Ingen planritning än",
      planEmptyBody:
        "Rita upp lokalen så att Översikten kan visa var borden faktiskt står. En servitör som ser rummet vet vilket bord som ropar — en lista säger bara vilken ruta i ordningen.",
      planSaved: "Ritningen är sparad.",
      somethingWrong: "Något gick fel.",
      undo: "Ångra",
      rotate: "Vrid",
      removeFromPlan: "Ta bort från ritningen",
      notPlaced: "Inte utplacerade",
      allPlaced: "Alla bord står på en ritning.",
      managePlans: "Hantera ritningar",
      newPlan: "Ny ritning",
      newPlanPlaceholder: "T.ex. Uteserveringen",
      add: "Lägg till",
      save: "Spara",
      saving: "Sparar…",

      /* Rummet: formen, storleken och det som inte är ett bord. */
      addFurniture: "Lägg till i rummet",
      removeItem: "Ta bort",
      selectHint: "Välj ett bord eller något i rummet för att ändra det.",
      shape: "Form",
      shapeROUND: "Runt",
      shapeSQUARE: "Fyrkantigt",
      shapeRECT: "Avlångt",
      widthLabel: "Bredd",
      heightLabel: "Djup",
      itemLabel: "Egen text",
      itemLabelPlaceholder: "T.ex. Bašta",
      itemLabelHint: "Din egen text står kvar som du skrivit den. Bara sortens namn översätts.",
      planSize: "Rummets storlek",
      planSizeHint: "En ruta är ungefär en halv meter. 40 × 30 blir ett rum på tjugo gånger femton meter.",
      planName: "Ritningens namn",
      rename: "Byt namn",
      planDelete: "Ta bort ritningen",
      planDeleteConfirm: "Ta bort ritningen {name}? Borden blir kvar, men hamnar bland de outplacerade.",
      planCanvasEmpty: "Dra ut ett bord eller lägg till baren för att börja.",
    },

    /**
     * Passets slut: rutan som varnar innan skärmen loggas ut.
     *
     * Låg som hårdkodad svenska mitt i en yta som annars följer personens
     * eget språk — och det är den enda rutan som dyker upp av sig själv, utan
     * att någon klickat. En kock som möter fyra svenska ord och en nedräkning
     * hen inte förstår trycker på fel knapp.
     *
     * `/backoffice` skickar in svenskan uttryckligen med
     * `burpInternalSurface()`: en plattformsadmin har ingen `staff.locale`.
     *
     * ENBART strängar — skickas till en klientkomponent.
     */
    session: {
      idleTitle: "Loggas ut om {n} s",
      idleBody: "Skärmen har stått orörd en stund. Kassan loggas ut så att ingen annan kommer åt den.",
      stayLoggedIn: "Jag är kvar",
      logOutNow: "Logga ut nu",
    },

    /**
     * Utskicken till gästerna (migration 0076).
     *
     * Går bara till den som sagt ja OCH handlat hos restaurangen. Texten i
     * SJÄLVA brevet ligger under `marketing` och skrivs pa gästernas sprak —
     * de här orden är personalens egna, som resten av ytan.
     *
     * ENBART strängar — skickas till klientkomponenter.
     */
    campaigns: {
      title: "Utskick till era gäster",
      intro: "Går bara till gäster som sagt ja OCH handlat hos er. Nya gäster nås inte den här vägen — det är avsikten.",
      template: "Mall",
      subject: "Ämnesrad",
      body: "Brevtext",
      audience: "{n} mottagare",
      noAudience: "Ingen gäst har sagt ja till utskick från er än.",
      credits: "{n} utskick kvar",
      noCredits: "Saldot räcker inte. Hör av dig till Burp för fler utskick.",
      send: "Skicka",
      sending: "Skickar…",
      sent: "Utskicket gick till {n} mottagare.",
      language: "Brevet skrivs på {language} — det språk era gäster läser.",
      history: "Tidigare utskick",
      historyEmpty: "Inget utskick än.",
      failedSome: "{n} brev gick inte fram och är återbokade.",
      statusSENT: "Skickat",
      statusFAILED: "Gick inte fram",
      statusSENDING: "Skickas",
      statusDRAFT: "Utkast",
    },

    /**
     * Etiketten under en text som en maskin översatt (öppen fråga 16).
     *
     * Gästens meddelande till köket kommer på gästens språk. Det översätts
     * till personalens — men originalet står kvar under, och etiketten säger
     * vilket som är vilket. En maskin kan ha fel, och då ska den som lagar
     * maten kunna se vad gästen faktiskt skrev.
     *
     * ENBART strängar — skickas till klientkomponenter.
     */
    translation: {
      auto: "Översatt automatiskt",
      original: "Gästens egna ord",
    },

    /**
     * Inredningen på planritningen.
     *
     * Sorterna är en fast lista och översätts — restaurangens EGEN etikett på
     * en sak ("Bašta") gör det aldrig. Se migration 0072.
     *
     * ENBART strängar — skickas till klientkomponenter.
     */
    floorItem: {
      BAR: "Bar",
      WALL: "Vägg",
      DOOR: "Dörr",
      WINDOW: "Fönster",
      PLANT: "Växt",
      STAIRS: "Trappa",
      WC: "Toalett",
      KITCHEN: "Kök",
      TEXT: "Text",
    },

    /**
     * Statistik, omdömen, erbjudanden, presentkort, avräkning och händelser.
     *
     * Sex ytor i ett avsnitt därför att var och en är liten. En egen nyckelnivå
     * per sida hade gett sex objekt med två rader i.
     *
     * ENBART strängar — flera av ytorna är klientkod.
     */
    reports: {
      statsEmptyTitle: "Inga genomförda beställningar i perioden",
      statsEmptyBody:
        "Statistiken räknar bara order som slutförts — en order i kön är inte omsättning.",
      revenue: "Omsättning",
      revenueInclVat: "Omsättning inkl. moms",
      inclVat: "inkl. moms",
      orders: "Beställningar",
      tips: "Dricks",
      tipsToStaff: "går till personalen",
      feeHint:
        "Gästernas pengar går direkt till er — Burp håller dem aldrig. Avgiften samlas per månad och faktureras i efterhand; den står på",
      feeHintAfter:
        ". Betalleverantörens kortavgift ingår inte, den ligger mellan er och er inlösare.",
      settlementLink: "Avräkning",
      avgHint: "den siffran gästen minns",
      mostPopular: "Populärast",
      revenuePerTable: "Omsättning per bord",
      revenuePerTableHint:
        "Siffran QR-beställningen finns för att kunna ge. Bord utan order visas som noll.",

      reviewsTitle: "Omdömen",
      reviewsIntro:
        "Betyg kan bara lämnas av gäster som genomfört en beställning. Du kan svara offentligt, men inte ändra betyget eller texten.",
      reviewsEmptyTitle: "Inga omdömen än",
      reviewsEmptyBody: "De kommer när gäster börjat beställa och deras order slutförts.",
      reviewsWorthLooking: "värt att titta på",
      guest: "Gäst",
      hiddenByBurp: "Dold av Burp",
      ratingOnly: "Gästen lämnade bara betyg, ingen text.",
      editReply: "Ändra svaret",
      removeReply: "Ta bort svaret",
      replyPublicly: "Svara publikt",
      replyHintLow: "Ett sakligt svar på ett lågt betyg gör mer nytta än inget svar alls.",
      replyPlaceholder: "Tack för att du beställde…",

      settlementTitle: "Avräkning",
      settlementIntro:
        "Burps avgift, samlad per månad och fakturerad i efterhand. Gästernas pengar går direkt till er — de passerar aldrig Burp — så det här är det enda som ska betalas härifrån.",
      settlementOngoing: "Pågående — inte fakturerad än",
      exportCsv: "Ladda ner som CSV",
      exportCsvHint: "Öppnas i Google Kalkylark och Excel.",
      settlementClosed: "Stängda perioder",
      settlementEmptyTitle: "Ingen period är stängd än",
      settlementEmptyBody:
        "En avräkning skapas när månaden är slut. Fram till dess räknas den bara upp här ovanför.",
      settlementFrozenHint:
        "Avgiften läses ur de rader som skrevs när varje order lades, inte ur dagens procentsats — en gammal period visar vad som faktiskt togs ut då. Betalleverantörens kortavgift ingår inte; den ligger mellan er och er inlösare.",
      completedInPeriod: "slutförda i perioden",
      tipsNotInFeeBase: "personalens pengar — ingår inte i avgiftsunderlaget",
      refundedToGuests: "Återbetalt till gäster",
      creditForRefunded: "Kredit för helt återbetalda order",

      eventsTitle: "Händelser",
      eventsIntro:
        "Återbetalningar och avbrutna beställningar, med vem som låg bakom. Raderna kommer ur loggar som inte går att skriva om i efterhand.",
      eventsEmptyBody:
        "Inga pengar har lämnats tillbaka och ingen beställning har avbrutits.",
      eventRefund: "Återbetalning",
      eventCancelled: "Avbruten beställning",
      eventsCancelHint:
        "En avbruten beställning står med sitt hela belopp — det är vad som inte blev av, inte vad någon fick tillbaka. Kortbetalningar som aldrig gick igenom syns här som avbrutna, och gästen har då aldrig debiterats.",
      actorGuest: "gästen själv",
      actorWebhook: "betalleverantören",
      actorSystem: "systemet",

      couponsIntro:
        "Rabattkoder gästen slår in i kassan. Rabatten dras från notan — och därmed även från underlaget för Burps avgift, så ni betalar aldrig avgift på pengar ni inte fick in.",
      couponsVsGiftCards:
        "De ser ut som samma sak men är det inte: en kupong är en rabatt som sänker notan, ett presentkort är förbetalda pengar som betalar den.",
      giftCardsHere: "De ligger här",
      newCoupon: "Ny kod",
      code: "Kod",
      codePlaceholder: "SOMMAR25",
      codeHint: "Bokstäver och siffror. Gästen kan skriva den med gemener.",
      discount: "Rabatt",
      percent: "Procent",
      fixedAmount: "Fast belopp",
      cap: "Tak (valfritt)",
      amount: "Belopp",
      minimumBill: "Minsta nota",
      none: "ingen",
      validUntil: "Gäller till",
      totalCount: "Antal totalt",
      unlimited: "obegränsat",
      perGuest: "Per gäst",
      create: "Skapa",
      creating: "Skapar…",
      cancel: "Avbryt",
      couponsEmptyTitle: "Inga erbjudanden än",
      couponsEmptyBody:
        "En rabattkod är ett sätt att få tillbaka gäster som varit här en gång. Rabatten dras från notan innan Burps avgift räknas.",
      turnOff: "Stäng av",
      turnOn: "Slå på",
      usedOf: "{used} av {total}",
      usedTimes: "{used} gånger",
      inDiscount: "{amount} i rabatt",

      giftCardsTitle: "Presentkort",
      giftCardsIntro:
        "Förbetalt värde som bara går att lösa in hos er. Saldot räknas ur transaktionerna och lagras aldrig — ett kort kan användas flera gånger tills det är slut.",
      giftCardIssued: "Presentkortet är utgivet",
      giftCardIssuedHint:
        "Skriv koden på kortet eller skicka den till gästen. Den står kvar i listan nedan.",
      copy: "Kopiera",
      copied: "Klart",
      newGiftCard: "Nytt presentkort",
      amountIn: "i {currency}",
      recipient: "Till",
      optional: "(valfritt)",
      recipientPlaceholder: "mottagarens e-post",
      note: "Anteckning",
      notePlaceholder: "T.ex. kompensation bord 4",
      issue: "Ge ut",
      giftCardsEmptyTitle: "Inga presentkort än",
      giftCardsEmptyBody:
        "Ett presentkort är förbetalt värde hos er. Det går att använda flera gånger tills det är slut, och resten ligger kvar till nästa besök.",
      block: "Spärra",
      unblock: "Öppna igen",
      tipChoice: "Vanligast: {choice} · {n} av {total}",
      tipChoiceOwn: "eget belopp",
      economy: "Ekonomi",
      avgOrder: "Snittnota",
      ofWhichVat: "varav moms",
      netExclVat: "Netto exkl. moms",
      burpFee: "Burps avgift",
      feeShare: "{percent} % av omsättningen",
      afterFee: "Kvar efter Burps avgift",
      prepTitle: "Tid till klar mat",
      median: "Median",
      ninetieth: "9 av 10 inom",
      measuredOrders: "{n} mätta order",
      unanswered: "Obesvarade",
      nothingInPeriod: "Ingenting att redovisa i perioden",
      paidDirect: "betalades direkt till er",
      ofWhichCash: "varav kontant i kassan",
      yourReply: "Ert svar",
      offersHere: "De ligger här",
      periodLabel: "Period",
      noEndDate: "Tomt = inget slutdatum.",
    },

    /**
     * Serveråtgärdernas svar när något inte går igenom.
     *
     * De här texterna skickas tillbaka som `result.message` och visas rakt av
     * i gränssnittet. Utan dem svarade en bosnisk sida på svenska så fort
     * någon skrev ett felaktigt belopp — sidan var översatt men inte samtalet.
     *
     * Avsnittet passerar ALDRIG server/klient-gränsen som objekt: en åtgärd är
     * serverkod och plockar ut den sträng den behöver. Bara strängen reser.
     *
     * **Databasens egna fel står kvar på sitt språk.** Där en åtgärd returnerar
     * `error.message` rakt av kommer texten ur Postgres eller ur ett
     * `raise exception` i en migration, och den är inte ordbokens att styra.
     * Se raden i docs/TODO.md.
     */
    errors: {
      menuNeedsName: "Menyn behöver ett namn.",
      nameTooLong: "Namnet är för långt.",
      menuNeedsDay: "Menyn måste gälla minst en dag.",
      endAfterStart: "Sluttiden måste ligga efter starttiden.",
      menuNoPublishedItems: "Menyn har inga publicerade rätter än. Publicera minst en rätt först.",
      categoryNeedsName: "Kategorin behöver ett namn.",
      accentInvalid: "Skriv färgen som #rrggbb, till exempel #dc2626.",
      accentUnreadable:
        "Varken vit eller svart text går att läsa på den färgen. Prova en aning mörkare eller ljusare.",
      accentInvisible:
        "Färgen försvinner mot bakgrunden i ljust eller mörkt läge. Prova en färg med mer djup.",
      bookingFailed: "Bokningen gick inte igenom.",
      surchargeInvalid: "Tillägget är inte ett giltigt belopp.",
      googleUrlInvalid: "Länken måste peka på Google. Kopiera den ur er Google-profil.",
      itemNeedsName: "Rätten behöver ett namn.",
      itemNotFound: "Rätten hittades inte.",
      groupNeedsName: "Gruppen behöver ett namn.",
      minAtLeastZero: "Minsta antal måste vara 0 eller mer.",
      maxAtLeastOne: "Högsta antal måste vara minst 1.",
      minNotAboveMax: "Minsta antal kan inte vara större än högsta.",
      optionNeedsName: "Tillvalet behöver ett namn.",
      timeMustBeFuture: "Tidpunkten måste ligga i framtiden — annars är rätten redan tillgänglig.",

      onlyCashOrTerminal: "Bara kontant och kort i terminal kan registreras här.",
      onlyCompletedOrders: "Bara en slutförd order kan kvitteras. Markera den som serverad först.",
      orderAlreadyPaid: "Ordern är redan betald.",
      amountAboveZero: "Beloppet måste vara större än noll.",
      alreadySettledCash: "Ordern är redan kvitterad kontant.",
      alreadySettledTerminal: "Ordern är redan kvitterad i terminalen.",
      tableOrderAlreadySettled: "En av bordets order är redan kvitterad.",
      refundNeedsReason: "Skriv varför notan betalas tillbaka.",
      providerAccountNotFound: "Betalkontot hittades inte hos leverantören.",
      paymentMissingReference: "Betalningen saknar referens hos leverantören.",
      providerUnknownError: "Okänt fel hos leverantören.",
      providerRefundFailed: "Leverantören kunde inte genomföra återbetalningen.",
      providerUnreachable: "Kunde inte nå betalleverantören. Försök igen.",

      /*
       * Öppettidernas tre fel. `{day}` fylls i med veckodagen ur `weekday`.
       *
       * Överlapp kan korsa dygnsgränsen — fredagens nattpass mot lördagens
       * morgonpass — och rapporteras då på lördagen, som är den dag som lades
       * till sist. Meningen om nattpasset står där för att den som fått felet
       * annars letar efter en krock på fel dag.
       */
      hoursOverlap:
        "{day}: passet överlappar ett annat. Kom ihåg att ett nattpass fortsätter in på nästa dag.",
      hoursZeroLength: "{day}: öppnar och stänger på samma klockslag.",
      hoursInvalidTime: "{day}: ogiltigt klockslag. Använd formatet 11:00.",

      editWindowRange: "Ändringsfönstret ska vara mellan 0 och 3600 sekunder.",
      streetRequired: "Gatuadressen får inte vara tom.",
      cityRequired: "Staden får inte vara tom.",
      // `{country}` fylls i ur `country`-avsnittet — landet på personens eget
      // språk, inte det engelska maskinnamnet i COUNTRY_INFO.
      postalCodeInvalid: "Postnumret ser inte ut att gälla i {country}.",
      priceTierRange: "Prisklassen måste vara 1–4.",
      locationUnreadable:
        "Kunde inte läsa någon plats ur det där. Klistra in en länk från Google Maps, eller skriv koordinaterna som 43.8595, 18.4287.",
      punchCardRange:
        "Antalet besök ska vara mellan 2 och 50. Ett kort på ett besök är inget kort.",

      tableNumberRequired: "Bordsnummer krävs.",
      tableNumberTooLong: "Bordsnumret är för långt.",
      qrCodeFailed: "Kunde inte generera en unik QR-kod. Försök igen.",

      replyEmpty: "Skriv något innan du publicerar svaret.",
      replyTooLong: "Svaret är för långt. Håll det under 2000 tecken.",

      couponCodeFormat: "Koden ska vara 3–32 tecken, bara bokstäver och siffror.",
      percentRange: "Procentsatsen ska vara mellan 1 och 100.",
      capUnreadable: "Taket gick inte att tolka.",
      amountUnreadable: "Beloppet gick inte att tolka.",
      minOrderUnreadable: "Minsta ordersumma gick inte att tolka.",
      endDateUnreadable: "Slutdatumet gick inte att tolka.",
      couponCodeExists: "Koden finns redan hos er.",
      giftCardCodeFailed: "Kunde inte skapa en unik kod. Försök igen.",

      imageNotYours: "Bilden hör inte till din restaurang.",
      approvedImageSupport: "Godkända bilder tas bort via Burp support.",
      subscriptionIncomplete: "Prenumerationen var ofullständig.",

      emailRequired: "Skriv en e-postadress.",
      invitationExists: "Det finns redan en öppen inbjudan till den adressen.",
    },

    /**
     * Bilduppladdningen, som både menyredigeraren och presentationen använder.
     *
     * Eget litet avsnitt i stället för två kopior i `menu` och `settings` —
     * det är samma ruta och samma besked oavsett vilken sida den står på.
     */
    image: {
      formatError: "Bilden måste vara JPEG, PNG, WebP eller AVIF.",
      uploadedNotice:
        "Bilden är uppladdad och väntar på granskning. Den syns för gästen när den godkänts.",
      adjustTitle: "Justera bilden",
      adjustHint: "Klicka i bilden för att välja vad som ska synas när den beskärs.",
      adjustNoReview: "Justeringar syns direkt och behöver ingen ny granskning.",
      brightness: "Ljusstyrka",
      contrast: "Kontrast",
      saturation: "Mättnad",
      adjustReset: "Återställ",
      adjustSave: "Spara justering",
      adjustSaving: "Sparar…",
      adjustSaved: "Justeringen är sparad.",
      adjustFailed: "Justeringen kunde inte sparas.",
      uploading: "Laddar upp…",
      registering: "Registrerar…",
    },

    /* Restaurangens egna dokument (migration 0064). */
    documents: {
      title: "Dokument",
      hint: "Allergenintyg, vinlista eller cateringblad som PDF. Menyn hör inte hit — den redigeras under Meny och går att beställa ur.",
      empty: "Inga dokument än.",
      titleLabel: "Titel",
      titlePlaceholder: "Vinlista 2026",
      choose: "Välj PDF",
      add: "Lägg till dokument",
      adding: "Laddar upp…",
      remove: "Ta bort",
      removeConfirm: "Ta bort dokumentet? Det går inte att ångra.",
      pending: "Väntar på granskning",
      rejected: "Avvisat",
      approved: "Publicerat",
      needTitle: "Skriv en titel först.",
      formatError: "Dokumentet måste vara en PDF.",
      sizeError: "Dokumentet får vara högst 10 MB.",
      failed: "Dokumentet kunde inte sparas.",
    },

    /* Inbjudningssidan. Personen är inloggad men ännu inte personal. */
    invitation: {
      joinFailed: "Inbjudan kunde inte lösas in.",
      joining: "Ansluter…",
      join: "Gå med",
    },

    upcomingLater: (count: number) =>
      count === 1 ? "1 förbeställning senare i dag." : `${count} förbeställningar senare i dag.`,
  },

  /**
   * Ländernas namn.
   *
   * `COUNTRY_INFO[...].name` står på engelska och är avsiktligt ett
   * maskinnamn — det används i brev till Burp och i loggar. Det som visas för
   * en människa hämtas här i stället, och står på hennes språk.
   *
   * Nycklarna är `CountryCode` ur `@burp/core`. Ett femte land måste läggas
   * till i båda, precis som `DEFAULT_LOCALE_BY_COUNTRY` — ett test i
   * `i18n.test.ts` kräver det.
   */
  country: {
    BA: "Bosnien och Hercegovina",
    HR: "Kroatien",
    RS: "Serbien",
    SE: "Sverige",
  },

  /*
   * Allergenerna.
   *
   * Koder i databasen (migration 0071), namn här. Det är enda stället på menyn
   * där en gäst som inte förstår riskerar något värre än en missad rätt — och
   * därför det enda av restaurangens innehåll som översätts.
   *
   * Ändras ALLERGENS i @burp/core måste den här listan följa med. Samma krav
   * som country_time_zone() och COUNTRY_INFO.
   */
  allergen: {
    GLUTEN: "Gluten",
    CRUSTACEANS: "Skaldjur",
    EGGS: "Ägg",
    FISH: "Fisk",
    PEANUTS: "Jordnötter",
    SOY: "Soja",
    MILK: "Mjölk",
    NUTS: "Nötter",
    CELERY: "Selleri",
    MUSTARD: "Senap",
    SESAME: "Sesam",
    SULPHITES: "Sulfiter",
    LUPIN: "Lupin",
    MOLLUSCS: "Blötdjur",
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
