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
    settings: {
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
      allergensHint: "kommaseparerade",
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
      markSoldOut: "Markera slut",
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
