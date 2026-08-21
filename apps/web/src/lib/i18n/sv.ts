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
      erbjudanden: "Erbjudanden",
      omdomen: "Omdömen",
      statistik: "Statistik",
      avrakning: "Avräkning",
      handelser: "Händelser",
      personal: "Personal",
      installningar: "Inställningar",
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

    upcomingLater: (count: number) =>
      count === 1 ? "1 förbeställning senare i dag." : `${count} förbeställningar senare i dag.`,
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
