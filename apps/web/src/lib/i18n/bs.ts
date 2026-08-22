import type { Dictionary } from "./sv";

/**
 * Bosanski / hrvatski / srpski.
 *
 * EN ordbok för alla tre standarderna, latinsk skrift. Skillnaderna mellan dem
 * är små i den här sortens text — knappar, kvitton, felmeddelanden — och tre
 * nästan identiska filer hade blivit tre ställen att glömma uppdatera.
 *
 * Där standarderna faktiskt skiljer sig har den bosniska formen valts, eftersom
 * Bosnien är huvudmarknaden: `sto` och inte `stol`, `radno vrijeme` och inte
 * `radno vreme`. En kroatisk eller serbisk gäst läser det utan att stanna upp.
 *
 * `hreflang` pekar däremot ut alla tre (`bs`, `hr`, `sr-Latn`) mot samma URL —
 * se `LOCALE_ALTERNATE_TAGS`. Google i Zagreb och Belgrad ska hitta sidan.
 *
 * ── Plural ──────────────────────────────────────────────────────────────────
 *
 * Språket har tre former: 1, 2–4 och 5+. Dessutom räknas 21 och 101 som 1 men
 * 11 inte. Funktionerna nedan gör det rätt i stället för att välja pluralformen
 * och hoppas — "1 rezultata" läser som ett trasigt system.
 */

/** 1, 21, 31 … men inte 11. */
function isOne(count: number): boolean {
  return count % 10 === 1 && count % 100 !== 11;
}

/** 2–4, 22–24 … men inte 12–14. */
function isFew(count: number): boolean {
  const last = count % 10;
  const teens = count % 100;
  return last >= 2 && last <= 4 && (teens < 12 || teens > 14);
}

export const bs: Dictionary = {
  site: {
    forRestaurants: "Za restorane",
    forGuests: "Za goste",
    home: "Burp — na početnu",
    tagline:
      "Svaki restoran sa svojom stranicom: jelovnik, fotografije, radno vrijeme i put do vrata. Skenirajte QR kod za stolom i naručite — bez aplikacije i bez naloga.",
    cities: "Gradovi",
    cuisines: "Kuhinje",
    restaurantsIn: (city: string) => `Restorani u gradu ${city}`,
    joinBurp: "Prijavite svoj restoran",
    logIn: "Prijava",
    createAccount: "Napravi nalog gosta",
    myOrders: "Moje narudžbe",
    breadcrumbs: "Putanja",
    allCities: "Svi gradovi",
    language: "Jezik",

    /* Navigacija u zaglavlju. */
    discover: "Otkrij",
    map: "Mapa",
    becomePartner: "Postanite partner",
    mainNav: "Glavni meni",
    searchLabel: "Pretraga restorana ili jela",
    searchPlaceholder: "Pretraži restorane ili jela",
  },

  discover: {
    title: "Svi restorani na mapi",
    intro:
      "Pogledajte gdje se nalaze prije nego što odlučite. Filtrirajte po kuhinji, gradu i po tome šta je otvoreno sada.",
    openNow: "Otvoreno sada",
    showAll: "Prikaži sve",
    sort: "Sortiraj",
    sortRating: "Najbolje ocijenjeni",
    sortName: "Naziv A–Ž",
    mapLabel: "Mapa restorana",
    mapEmpty: "Nijedan od rezultata još nema oznaku na mapi.",
    mapFailed: "Mapa se nije učitala. Lista pored prikazuje ista mjesta.",
    results: "Rezultati",
    empty: "Nijedan restoran ne odgovara filteru.",
    emptyHint: "Uklonite jedan filter ili pretražite cijelo tržište.",
  },

  join: {
    metaTitle: "Priključite svoj restoran",
    metaDescription:
      "Primajte narudžbe preko QR koda za stolom i za preuzimanje. Vlastita stranica s menijem, slikama, radnim vremenom i uputama do lokala.",

    eyebrow: "Za restorane",
    title: "Priključite svoj restoran",
    intro:
      "Vlastita stranica s menijem, slikama, radnim vremenom i uputama do lokala — i narudžba direktno za stolom preko QR koda. Gostu ne treba ni aplikacija ni nalog.",

    accountTitle: "Prvo otvorite nalog",
    accountBody:
      "Nalog postaje vlasnik restorana i na njega vam odgovaramo. Traje pola minute.",
    createAccount: "Otvori nalog",
    haveAccount: "Već ga imam",

    country: "Država",
    countryHelp:
      "Određuje valutu ({currency}), stope PDV-a i vremensku zonu. Kasnije se mijenja samo preko Burpa.",
    name: "Naziv restorana",
    street: "Ulica i broj",
    postalCode: "Poštanski broj",
    city: "Grad",
    phone: "Telefon",
    email: "E-mail",
    description: "Kratko predstavljanje",
    optional: "nije obavezno",
    descriptionPlaceholder: "Po čemu je vaš lokal poseban? Dovoljne su dvije rečenice.",
    submit: "Pošalji prijavu",
    submitting: "Šaljem…",

    doneTitle: "Hvala — prijava je stigla.",
    doneBody:
      "Burp je pregleda i javlja vam se. U međuvremenu već možete unijeti meni i radno vrijeme: vaš restoran je nevidljiv gostima dok ne bude odobren, pa se ništa što sada uradite ne vidi unaprijed.",
    toDashboard: "Na vašu kontrolnu ploču",

    errors: {
      nameRequired: "Restoran treba naziv.",
      countryRequired: "Odaberite državu.",
      orgNumberInvalid: "{label} ne izgleda kao da važi u {country}.",
      postalCodeInvalid: "Poštanski broj ne izgleda kao da važi u {country}.",
      streetRequired: "Ulica ne smije biti prazna.",
      cityRequired: "Grad ne smije biti prazan.",
      emailInvalid: "E-mail adresa ne izgleda ispravno.",
      orgNumberTaken:
        "{label} je već registrovan na drugi restoran. Je li se neko kod vas već prijavio?",
      orgNumberFormat: "{label} ima pogrešan format za tu državu.",
    },
  },

  home: {
    label: "Tržnica hrane",
    headline: ["Svaki restoran,", "svoja stranica"],
    headlineCity: (city: string) => `Projedite se kroz grad ${city}.`,
    intro:
      "Jelovnik sa fotografijama, radno vrijeme i put do vrata — i narudžba direktno za stolom preko QR koda. Bez aplikacije, bez naloga.",
    searchLabel: "Pretraga restorana ili jela",
    searchPlaceholder: "Pretraži restoran, jelo ili kuhinju",
    searchButton: "Traži",
    searchHint: "Pretražuje nazive i opise restorana.",
    city: "Grad",
    cuisine: "Kuhinja",
    allCities: "Svi gradovi",
    allCuisines: "Sve kuhinje",
    seeAllIn: (city: string) => `Svi u gradu ${city}`,
    allRestaurants: "Svi restorani",
    hits: (count: number) => (isOne(count) ? `${count} rezultat` : `${count} rezultata`),
    searchedFor: "Pretraga",
    featured: "Izdvojeno",
    seeMenu: "Pogledaj jelovnik",
    noRatings: "Još nema recenzija",
    ratingSummary: (average: string, count: number) =>
      `${average} od 5 u prosjeku, ${count} ${isOne(count) ? "recenzija" : "recenzija"}`,
    todayHours: (hours: string) => `Danas ${hours}`,
    closedToday: "Danas zatvoreno",
    emptyTitle: "Nijedan restoran ne odgovara.",
    emptyFiltered: "Pokušajte drugu pretragu, drugi grad ili uklonite filtere.",
    emptyAll: "Trenutno nema aktivnih restorana za prikaz.",
    showAll: "Prikaži sve restorane",
  },

  city: {
    label: "Grad",
    title: (city: string) => `Restorani u gradu ${city}`,
    intro: (count: number, city: string) =>
      `${
        isOne(count) ? "Jedan restoran prima" : `${count} ${isFew(count) ? "restorana primaju" : "restorana prima"}`
      } narudžbe preko Burpa u gradu ${city}. Naručite za preuzimanje ili skenirajte QR kod za stolom.`,
    cuisineLabel: (city: string) => `Kuhinje u gradu ${city}`,
    cuisineTitle: (cuisine: string, city: string) => `${cuisine} u gradu ${city}`,
    cuisineIntro: (count: number, cuisine: string, city: string) =>
      `${
        isOne(count) ? "Jedan restoran služi" : `${count} ${isFew(count) ? "restorana služe" : "restorana služi"}`
      } ${cuisine.toLowerCase()} u gradu ${city}.`,
    cuisineMeta: (cuisine: string, city: string) =>
      `Naručite ${cuisine.toLowerCase()} u gradu ${city}. Preuzimanje ili narudžba direktno za stolom — bez aplikacije.`,
    otherCuisines: (city: string) => `Druge kuhinje u gradu ${city}`,
    emptyTitle: "Ovdje još nema restorana.",
    emptyBody: "Vodite restoran u blizini?",
    emptyAction: "Prijavite svoj restoran",
  },

  restaurant: {
    onThisPage: "Na ovoj stranici",
    menu: "Jelovnik",
    findUs: "Kako do nas",
    reviews: "Recenzije",
    orderForPickup: "Naruči za preuzimanje",
    noMenuTitle: "Trenutno nema jelovnika",
    noMenuBody: (name: string) =>
      `${name} nije objavio jelovnik za ovo doba dana. Slobodno ih nazovite.`,
    openToday: (hours: string) => `Danas otvoreno ${hours}`,
    closedToday: "Danas zatvoreno",
    phone: "Telefon",
    openingHours: "Radno vrijeme",
    noOpeningHours: "Radno vrijeme nije navedeno.",
    closed: "Zatvoreno",
    reviewSummary: (average: string, count: number) =>
      `${average} od 5 na osnovu ${count} ${isOne(count) ? "recenzije" : "recenzija"} iz završenih narudžbi.`,
    reviewsEmptyTitle: "Još nema recenzija",
    reviewsEmptyBody: "Ocjenu mogu ostaviti samo gosti koji su zaista naručili.",
    reviewAuthorFallback: "Gost",
    foodRating: "Ocjena hrane",
    serviceRating: "Ocjena usluge",
    ratingOutOf: "{n} od 5",
    restaurantReply: "Odgovor restorana",
  },

  menu: {
    table: "Sto {number}",
    pickup: "Preuzimanje",
    noAppNoAccount: "Bez aplikacije. Bez naloga. Samo naručite.",
    sections: "Dijelovi jelovnika",
    search: "Pretraži jelovnik",
    searchPlaceholder: "Pronađi jelo",
    searchClear: "Poništi pretragu",
    searchEmpty: "Ništa na jelovniku ne odgovara upitu „{query}”.",
    searchEmptyHint: "Probajte kraću riječ ili pregledajte dijelove jelovnika.",
    soldOut: "Rasprodano za danas",
    ongoingOrderLink: "Pogledaj status i račun",
    ongoingOrder: "Imate narudžbu u toku",
    allergens: "Alergeni",
    chooseOptions: "Odaberi dodatke",
    hideOptions: "Sakrij dodatke",
    add: "Dodaj",
    added: "Dodano",
    priceFrom: "Od {price}",
    chooseExactly: "odaberite {n}",
    chooseBetween: "odaberite {min}–{max}",
    chooseUpTo: "odaberite najviše {n}",
    optionSoldOut: "(nema)",
    chooseFirst: 'Prvo odaberite u "{group}"',
    noteToKitchen: "Poruka za kuhinju",
    notePlaceholder: "Npr. bez luka",
    pickupTime: "Kada želite preuzeti?",
    asSoonAsPossible: "Što prije",
    tip: "Napojnica",
    noTip: "Bez napojnice",
    foodAndDrink: "Hrana i piće",
    ofWhichVat: "od toga PDV",
    hide: "Sakrij",
    itemCount: "{n} kom.",
    order: "Naruči",
    sending: "Šaljem…",
    removeOne: "Ukloni jedno: {name}",
    addOne: "Dodaj još jedno: {name}",
    orderFailed: "Narudžba nije poslana. Pokušajte ponovo.",
    noConnection: "Nema veze sa serverom. Provjerite mrežu i pokušajte ponovo.",
    retrying: "Nema veze. Vaša narudžba je sačuvana i bit će poslana čim se mreža vrati.",
    retryNow: "Pokušaj sada",
    retryGaveUp: "Ne možemo doći do servera. Narudžba je sačuvana — dodirnite da pokušate ponovo.",

    payHow: "Kako želite platiti?",
    payAtPlace: "Na licu mjesta",
    payByCard: "Karticom",
    payByCardHint: "Kartica, Apple Pay i Google Pay",
    payNow: "Plati",
    paying: "Plaćam…",
    paymentTitle: "Platite svoju narudžbu",
    paymentCancel: "Odustani",
    paymentFailed: "Plaćanje nije prošlo. Pokušajte ponovo ili platite na licu mjesta.",
    paymentAbandoned: "Plaćanje je otkazano. Narudžba nije poslana.",

    coupon: "Kod za popust",
    couponPlaceholder: "Npr. LJETO25",
    couponApply: "Primijeni",
    couponChecking: "Provjeravam…",
    couponRemove: "Ukloni kod",
    discount: "Popust",

    giftCard: "Poklon kartica",
    giftCardPlaceholder: "ABCD-EFGH-JKLM",
    giftCardApply: "Iskoristi",
    giftCardChecking: "Provjeravam…",
    giftCardRemove: "Ukloni poklon karticu",
    giftCardLeft: "Ostaje {amount}",
    toPay: "Za platiti",

    punchCard: "Kartica vjernosti",
    punchCardProgress: "{visits} od {size} posjeta",
    punchCardRemaining: "Još {n} posjeta do besplatnog obroka",
    punchCardEarned: "Ovaj obrok časti restoran",
    punchCardUse: "Iskoristi karticu vjernosti",
  },

  table: {
    tooManyTitle: "Previše pokušaja",
    tooManyBody: "Sačekajte trenutak i ponovo skenirajte kod.",
    lockedTitle: "Ovaj sto ne prima narudžbe",
    lockedBody: "Obratite se osoblju i pomoći će vam.",
    closedTitle: "Restoran je zatvoren",
    closedBody: "Narudžbe je moguće poslati samo u toku radnog vremena.",
    noMenuTitle: "Trenutno nema jelovnika",
    noMenuBody: "Restoran nije objavio jelovnik za ovo doba dana. Obratite se osoblju.",

    opensAt: "Otvara u {time}.",
    opensOn: "Otvara {day} u {time}.",
    noHours: "Radno vrijeme je na stranici restorana.",
    seeRestaurant: "Pogledaj restoran",
  },

  receipt: {
    title: "Vaša narudžba",
    table: "Sto {number}",
    pickup: "Preuzimanje",
    pickupAt: "Preuzima se kod",
    yourBill: "Vaš račun",
    foodAndDrink: "Hrana i piće",
    discount: "Popust",
    tip: "Napojnica",
    total: "Ukupno",
    payOnPickup: "Plaćanje se vrši na licu mjesta pri preuzimanju.",
    payAtTable: "Plaćanje se vrši na licu mjesta.",
    paidByCard: "Plaćeno karticom.",
    paidInTerminal: "Plaćeno karticom u restoranu.",
    refundedNotice: "Narudžba je refundirana.",
    notFiscalReceipt:
      "Ovo je potvrda narudžbe, a ne fiskalni račun. Račun dobijate od restorana.",

    reviewPrompt: "Kakva je bila hrana?",
    reviewOpen: "Ostavi recenziju",
    reviewFood: "Hrana",
    reviewService: "Usluga",
    reviewOptional: "nije obavezno",
    reviewComment: "Komentar",
    reviewStar: "{n} od 5",
    reviewSubmit: "Pošalji",
    reviewSending: "Šaljem…",
    reviewCancel: "Odustani",
    reviewThanks: "Hvala. Vaša recenzija pomaže sljedećem gostu.",
    reviewAlready: "Već ste ostavili recenziju za ovu narudžbu.",
    reviewFailed: "Recenzija nije sačuvana. Pokušajte ponovo.",
    backTo: "Nazad na {name}",
    progress: "Tok narudžbe",
    contactRestaurant: "Obratite se restoranu ako imate pitanja o narudžbi.",
    enjoy: "Prijatno",
    onTheWay: "Hrana je na putu do stola.",
    minutesLeft: "Otprilike još {n} minuta.",
    almostReady: "Uskoro gotovo.",
    editTitle: "Izmijeni narudžbu",
    editWindow: "Možete mijenjati još {n} sekundi.",
    editExpired: "Vrijeme za izmjene je isteklo.",
    removeItem: "Ukloni jelo",
    remove: "Ukloni",
    cancelOrder: "Otkaži narudžbu",
    cancelWarning: "Cijela narudžba će biti otkazana.",
    orderMore: "Naruči još",
    cancelConfirm: "Da, otkaži",
    cancelKeep: "Zadrži",
    changeFailed: "Izmjena nije prošla.",
    status: {
      DRAFT: "Nacrt",
      PLACED: "Poslana",
      ACCEPTED: "Prihvaćena",
      PREPARING: "Priprema se",
      READY: "Gotova",
      COMPLETED: "Servirana",
      CANCELLED: "Otkazana",
      REFUNDED: "Refundirana",
    },
  },

  account: {
    label: "Moj nalog",

    orders: "Narudžbe",
    favorites: "Omiljeni",
    addresses: "Adrese",
    details: "Moji podaci",
    logOut: "Odjava",

    ordersTitle: "Moje narudžbe",
    points: "Bodovi",
    pointsExpiring: "{n} bodova ističe u narednih 30 dana.",
    ordersEmpty: "Još niste ništa naručili.",
    findRestaurant: "Pronađi restoran",
    ongoing: "U toku",
    earlier: "Ranije",
    atTable: "za stolom",
    pickup: "preuzimanje",
    reviewed: "Već ste ocijenili ovu narudžbu.",
    reviewPromptAt: "Kakva je bila hrana u {restaurant}?",
    reviewNeedsFood: "Ocijenite hranu",

    favoritesEmptyTitle: "Još nema omiljenih",
    favoritesEmptyBody: "Sačuvajte restoran pa ćete ga brže pronaći ponovo.",
    browseRestaurants: "Pregledaj restorane",
    notAcceptingOrders: "Trenutno ne prima narudžbe.",
    saveFavorite: "Sačuvaj kao omiljeno",
    removeFavorite: "Ukloni iz omiljenih",

    addressesIntro: "Čuva se za narudžbe s dostavom. Dostava još nije uključena.",
    addressesEmptyTitle: "Nema sačuvanih adresa",
    addressesEmptyBody: "Dodajte jednu ispod pa je nećete morati pisati svaki put.",
    doorCodeShort: "šifra ulaza {code}",
    newAddress: "Nova adresa",
    addressLabel: "Naziv",
    addressLabelPlaceholder: "Kuća, Posao…",
    street: "Ulica i broj",
    postalCode: "Poštanski broj",
    city: "Mjesto",
    doorCode: "Šifra ulaza",
    optional: "nije obavezno",
    remove: "Ukloni",
    cancel: "Odustani",
    saving: "Čuvam…",
    saveAddress: "Sačuvaj adresu",

    exportTitle: "Preuzmite kopiju",
    exportBody:
      "Sve što Burp ima o vama u jednoj datoteci: vaš nalog, vaše adrese, sve narudžbe sa stavkama, vaše ocjene, omiljeni restorani, bodovi, kuponi i kartice vjernosti. Datoteka je JSON i može je čitati i čovjek i drugi program.",
    exportButton: "Preuzmi moje podatke",
    deleteTitle: "Obriši moj nalog",
    deleteBody:
      "Vaš nalog, profil, adrese i omiljeni restorani se brišu. To se ne može poništiti.",
    remainsTitle: "Ovo ostaje, bez vas",
    remainsOrders:
      "Vaše narudžbe i računi, kao knjigovodstvena dokumentacija restorana. Prestaju upućivati na vas.",
    remainsRatings:
      "Ocjene koje ste dali. Tekst koji ste napisali i slika koju ste dodali se brišu; broj ostaje bez pošiljaoca.",
    remainsPoints: "Vaši bodovi i kartice vjernosti nestaju — niko ih ne može iskoristiti.",
    deleteConfirmTitle: "Jeste li sigurni?",
    deleteConfirmBody:
      "Upišite {word} za potvrdu. Preuzmite prvo kopiju svojih podataka — poslije više neće ići.",
    deleteConfirmLabel: "Upišite {word} za potvrdu",
    deleting: "Brišem…",
    deleteForever: "Obriši zauvijek",

    erasedTitle: "Nalog je obrisan",
    erasedBody:
      "Vaš profil, vaše adrese i vaši omiljeni restorani su nestali, i ništa kod nas više ne upućuje na vas. Narudžbe ostaju kod restorana kao knjigovodstvena dokumentacija, bez veze s vama.",
    erasedAgain: "Možete naručiti ponovo kad god želite — za stolom nalog uopšte ne treba.",
    toHome: "Na početnu stranicu",

    errors: {
      mustBeLoggedIn: "Morate biti prijavljeni.",
      favoritesNeedAccount: "Morate biti prijavljeni da biste čuvali omiljene restorane.",
      favoriteFailed: "Nije uspjelo čuvanje.",
      reviewUnreadable: "Ocjena se nije mogla pročitati. Ocijenite bar hranu.",
      orderNotFound: "Narudžba nije pronađena.",
      reviewNotCompleted: "Ocjenu možete ostaviti tek kad narudžba bude gotova.",
      addressFieldsRequired: "Popunite ulicu, poštanski broj i mjesto.",
      postalCodeDigits: "Poštanski broj treba imati pet ili šest cifara.",
      addressRemoveFailed: "Adresa se nije mogla ukloniti.",
      confirmWord: "Upišite {word} za potvrdu.",
      eraseFailed: "Nalog se nije mogao obrisati.",
    },
  },

  email: {
    acceptedSubject: "{restaurant} je primio vašu narudžbu",
    acceptedBody: "Hrana je gotova za otprilike {n} minuta.",
    acceptedBodyNoTime: "Restoran je primio vašu narudžbu.",

    readySubject: "Vaša narudžba je spremna za preuzimanje",
    readyBody: "{restaurant} ima vašu narudžbu spremnu.",

    viewOrder: "Pogledaj narudžbu",
    footer: "Ovu poruku dobijate jer ste naručili za preuzimanje preko Burpa.",

    invitationSubject: "Pozvani ste u {restaurant} na Burpu",
    invitationHeading: "Dobrodošli u {restaurant}",
    invitationBody: "{restaurant} vas je pozvao na poziciju: {role}.",
    invitationOpenLink: "Otvorite link da biste počeli:",
    invitationCta: "Počnite",
    invitationExpiry: "Link vrijedi sedam dana i samo za ovu adresu.",
  },

  errors: {
    notFoundLabel: "404",
    notFoundTitle: "Ova stranica ne postoji.",
    notFoundBody:
      "Adresa se možda promijenila ili restoran više ne prima narudžbe preko Burpa. Probajte neki od gradova ispod.",
    notFoundAction: "Na početnu stranicu",
    errorLabel: "Greška",
    errorTitle: "Nešto je pošlo po zlu.",
    errorBody:
      "Krivica je naša, ne vaša. Pokušajte ponovo — ako ni tada ne uspije, slobodno nazovite restoran direktno.",
    errorRetry: "Pokušaj ponovo",
    loading: "Učitavanje…",
  },

  directions: {
    copy: "Kopiraj adresu",
    copied: "Kopirano",
    copiedNotice: "Adresa je kopirana.",
    opensInNewTab: " — otvara upute u novoj kartici",
    mapOf: (name: string) => `Mapa: ${name}`,
  },

  staff: {
    home: "Burp — na početnu",
    navLabel: "Navigacija za osoblje",
    logOut: "Odjava",
    language: "Jezik",
    languageSaving: "Spremanje…",
    languageError: "Jezik nije spremljen. Pokušajte ponovo.",

    role: {
      owner: "Vlasnik",
      manager: "Menadžer",
      staff: "Osoblje",
      kitchen: "Kuhar",
    },

    section: {
      oversikt: "Pregled",
      order: "Narudžbe",
      kok: "Kuhinjski ekran",
      kassa: "Kasa",
      meny: "Jelovnik",
      bord: "Stolovi i QR",
      erbjudanden: "Ponude",
      omdomen: "Ocjene",
      statistik: "Statistika",
      avrakning: "Obračun",
      handelser: "Događaji",
      personal: "Osoblje",
      installningar: "Postavke",
    },

    status: {
      DRAFT: "Nacrt",
      PLACED: "Poslana",
      ACCEPTED: "Primljena",
      PREPARING: "Priprema se",
      READY: "Spremna",
      COMPLETED: "Završena",
      CANCELLED: "Otkazana",
      REFUNDED: "Refundirana",
    },

    provider: {
      CASH: "Gotovina",
      TERMINAL: "Kartica na terminalu",
      GIFT_CARD: "Poklon kartica",
      STRIPE: "Kartica",
      MONRI: "Kartica",
    },

    kitchen: {
      live: "Narudžbe uživo",
      sound: "Zvuk",
      soundOn: "uključen",
      soundOff: "isključen",
      empty: "Nema aktivnih narudžbi.",
      updateFailed: "Narudžba nije ažurirana: {message}",
      sibling: "Narudžba {index} od {count} za stol",
      minutes: "{n} min",

      prepTime: "Gotovo za",
      prepMinutes: "{n} min",
      stepACCEPTED: "Primi",
      stepPREPARING: "Počni pripremu",
      stepREADY: "Gotovo",
      stepCOMPLETED: "Servirano",

      reject: "Odbij",
      rejectConfirm: "Odbij narudžbu",
      cancel: "Otkaži",

      upcomingTitle: "Predstojeće",
      upcomingHint: "Šalje se u kuhinju kada preostane samo vrijeme pripreme.",
    },

    /*
     * Bosniskan böjer efter tre grupper, inte två:
     *
     *   1, 21, 31 …        narudžba   (men inte 11)
     *   2–4, 22–24 …       narudžbe   (men inte 12–14)
     *   0, 5–20, 25–30 …   narudžbi
     *
     * Undantagen på 11–14 är hela skälet till att det här är en funktion och
     * inte en mall med `{n}`.
     */
    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    orderType: {
      table: "Stol {number}",
      TABLE: "Stol",
      PICKUP: "Preuzimanje",
      DELIVERY: "Dostava",
    },

    /* Kassan. ENBART strängar — skickas till klientkomponenter. */
    register: {
      toSettle: "Za naplatu",
      emptyTitle: "Sve je naplaćeno",
      emptyBody: "Svaka završena narudžba u posljednja 24 sata ima evidentiranu uplatu.",
      paidToday: "Naplaćeno danas",
      paidTodayHint:
        "Pregled smjene, gotovina i kartice. Redovi se ne mijenjaju — pogrešna naplata ispravlja se protustavkom, ne prepravljanjem historije.",

      onSameBill: "{count} na istom računu",
      alreadyPaid: "{paid} već plaćeno od {total}",
      showOrders: "Prikaži narudžbe",
      hideOrders: "Sakrij narudžbe",

      amountReceived: "Primljeni iznos",
      method: "Način plaćanja",
      settle: "Naplati",
      settleTable: "Naplati cijeli stol",
      settling: "Naplaćivanje…",
      settleFailed: "Naplata nije prošla.",

      closeBill: "Zatvori račun bez naplate",
      closeConfirm:
        "Zatvoriti račun bez ijedne naplate? Narudžbe ostaju i mogu se naplatiti pojedinačno.",
      closeFailed: "Račun nije zatvoren.",

      over: "Iznad računa za",
      under: "Ispod računa za",
      spreadHint: "Raspoređuje se na narudžbe za stolom srazmjerno njihovoj cijeni.",
      asEntered:
        "Evidentira se kako je upisano — zaokruživanje i popust u lokalu trebaju se vidjeti.",
      unreadableAmount: "Iznos nije čitljiv.",

      servedAt: "Servirano {when}",
      paidOfTotal: "{paid} plaćeno od {total}",
      billTotal: "račun {total}",
      refundedAmount: "refundirano {amount}",
      remaining: "preostalo {amount}",

      refund: "Vrati novac",
      refunding: "Vraćanje…",
      refundFailed: "Povrat nije prošao.",
      refundAmount: "Iznos",
      refundReason: "Razlog",
      refundReasonPlaceholder: "Npr. hladna supa",
      refundTooMuch: "Više od preostalog ({amount}).",
      cancel: "Otkaži",

      refundHintGIFT_CARD: "Vrijednost se vraća na poklon karticu, ne u kasu.",
      refundHintCASH: "Evidentira se kao protustavka. Novčanice vraćate preko pulta.",
      refundHintTERMINAL:
        "Evidentira se kao protustavka. Povrat radite na terminalu — Burp ga ne doseže.",
      refundHintPROVIDER:
        "Vraća se na karticu gosta preko procesora. Može potrajati nekoliko dana.",

      intro:
        "Završene narudžbe iz posljednja 24 sata. Društvo za stolom stoji kao jedan račun i naplaćuje se odjednom; iznos se raspoređuje na narudžbe umjesto vas. Narudžbe plaćene karticom već su naplaćene.",
      tipsTitle: "Napojnica za podjelu",
      tipsCash: "{amount} gotovina",
      tipsCard: "{amount} karticom",
      tipsPending: "{amount} na računima koji još nisu plaćeni",
      tipsPeriod: "Posljednja 24 sata",
      tipsHint:
        "Napojnica je novac osoblja i ne ulazi ni u promet ni u naknadu Burpa. Vraćen račun se ne računa.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    overview: {
      statOrders: "Narudžbe danas",
      statRevenue: "Promet danas",
      statAverage: "Prosjek po narudžbi",
      statTips: "Napojnica danas",
      statTipsHint: "pripada osoblju, ne restoranu",

      inKitchen: "Trenutno u kuhinji",
      allOrders: "Sve narudžbe",
      noOrdersTitle: "Trenutno nema narudžbi",
      noOrdersBody: "Nove narudžbe pojavljuju se ovdje čim ih gost pošalje.",

      tables: "Stolovi",
      tablesBusy: "{busy} od {total} zauzeto",
      noTablesTitle: "Nema unesenih stolova",
      noTablesBody: "Unesite stolove da biste mogli štampati QR naljepnice.",
      noTablesAction: "Unesi stolove",

      stateLEDIGT: "Slobodan",
      stateOPPEN_NOTA: "Otvoren račun",
      stateBESTALLNING: "Narudžba primljena",
      stateSERVERAS: "Spremno za servirati",
    },

    /* Personalsidan. ENBART strängar — skickas till klientkomponenter. */
    staffAdmin: {
      intro: "Ko ovdje radi, s kojom ulogom, i ko je pozvan ali još nije ušao.",
      actionFailed: "Radnja nije prošla.",

      inviteTitle: "Pozovite nekoga",
      inviteHint:
        "Osoba dobiva link koji vrijedi sedam dana i samo za adresu koju ovdje upišete.",
      email: "E-mail adresa",
      emailPlaceholder: "ime@primjer.ba",
      role: "Uloga",
      invite: "Pozovi",

      inviteCreated: "Poziv je kreiran",
      inviteSendYourself: "E-mail je na putu. Link možete poslati i sami:",
      copy: "Kopiraj",
      copied: "Kopirano",

      pendingTitle: "Čeka odgovor",
      validUntil: "vrijedi do {date}",
      revoke: "Opozovi",

      membersTitle: "Osoblje",
      you: "(vi)",
      ended: "završeno",
      end: "Završi",
      resume: "Nastavi",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    settings: {
      hoursTitle: "Radno vrijeme",
      hoursHint:
        "Gosti mogu naručiti samo dok ste otvoreni. Više smjena dnevno za ručak i večer. Ako zatvarate poslije ponoći, upišite vrijeme kakvo jeste — 22:00 do 02:00 znači da radite do dva ujutro.",
      cardTitle: "Plaćanje karticom",
      cardHint:
        "Gost plaća na svom telefonu. Ugovor je vaš, ne Burpov — novac ide pravo na vaš račun.",
      notifyTitle: "Obavijesti",
      notifyHint:
        "Kuhinjski ekran se već oglašava kad je otvoren. Ovo je za kad nije — obavijest stiže na telefon i kad niko ne stoji pred ekranom.",
      punchTitle: "Kartica vjernosti",
      punchHint: "Deseti dolazak častite. Broji dolaske, ne iznose.",
      policyTitle: "Pravila narudžbi",
      policyHint: "Šta gost smije mijenjati nakon što je naručio, i koliko dugo.",

      saving: "Spremanje…",
      save: "Spremi",
      saveFailed: "Spremanje nije uspjelo.",
      somethingWrong: "Nešto je pošlo po zlu.",
      saved: "Spremljeno.",

      hoursSaved: "Radno vrijeme je spremljeno.",
      nextDay: "sljedeći dan",
      remove: "Ukloni",
      openThisDay: "Otvori ovaj dan",
      addShift: "Dodaj smjenu",
      closedAllDay: "Zatvoreno cijeli dan",
      saveHours: "Spremi radno vrijeme",
      nothingToSave: "Nema šta spremiti",

      policySaved: "Pravila narudžbi su spremljena.",
      autoAccept: "Automatski primaj narudžbe",
      autoAcceptHint:
        "Bez ovoga neko mora pritisnuti Primi na svakoj narudžbi prije nego je kuhinja vidi.",
      prepTime: "Vrijeme pripreme",
      prepTimeUnit: "minuta",
      prepTimeHint: "Koristi se za procjenu čekanja koju gost vidi.",
      editWindow: "Prozor za izmjene",
      editWindowUnit: "sekundi",
      editWindowHint:
        "Koliko dugo nakon narudžbe gost smije mijenjati sadržaj. 0 potpuno isključuje izmjene.",
      editUntil: "Izmjena dozvoljena zaključno sa",
      editUntilHint: "Nakon ovog statusa gost više ne može mijenjati.",
      mayAdd: "Gost smije dodavati jela",
      mayRemove: "Gost smije uklanjati jela",
      mayChangeOptions: "Gost smije mijenjati priloge",
      cancelUntil: "Otkazivanje dozvoljeno zaključno sa",
      cancelUntilHint:
        "Otkazivanje ovisi o statusu, ne o prozoru za izmjene — gost treba moći otkazati dok se hrana nije počela pripremati.",
      scheduled: "Primaj narudžbe unaprijed",
      scheduledHint:
        "Gost bira vrijeme unaprijed. Narudžba ide u kuhinju tačno vrijeme pripreme ranije.",

      punchCard: "Kartica vjernosti",
      punchCardBody:
        "Nakon određenog broja dolazaka častite obrok. Broji dolaske a ne iznose — kafa vrijedi koliko i tri slijeda, a upravo to vraća ljude.",
      visits: "Broj dolazaka",
      cap: "Gornja granica",
      capPlaceholder: "cijeli račun",
      capHint: "Najviše za počastiti, u {currency}. Prazno = cijeli račun.",
      loggedInOnly:
        "Vrijedi samo za prijavljene goste. Gostu za stolom koji naručuje anonimno ne mogu se brojati dolasci — i ne trebaju se brojati.",

      pushNotConfigured:
        "Obavijesti još nisu uključene na platformi. Zvuk kuhinjskog ekrana radi kao i inače.",
      pushUnsupported:
        "Ovaj preglednik ne može primati obavijesti. Na iPhoneu radi kad se Burp doda na početni ekran.",
      pushBlocked:
        "Obavijesti su blokirane za Burp u ovom pregledniku. To se mijenja samo u postavkama preglednika — mi ne možemo pitati ponovo.",
      pushEnable: "Uključi za ovaj uređaj",
      pushDisable: "Isključi na ovom uređaju",
      pushOnHint: "Ovaj uređaj se oglašava kad stigne narudžba.",
      pushOffHint:
        "Svaki uređaj se uključuje posebno. Imate li i telefon i tablet, uključite na oba.",
      pushFailed: "Obavijesti nije bilo moguće uključiti.",

      cardOnTitle: "Plaćanje karticom je uključeno",
      cardOnBody:
        "Gosti mogu platiti karticom, Apple Payem i Google Payem direktno u jelovniku. Novac ide na vaš račun kod {provider} — Burp ga nikada ne prima. Naša naknada se oduzima iz uplate.",
      cardPendingTitle: "Čeka se {provider}",
      cardPendingBody:
        "Račun je otvoren ali ga {provider} još nije odobrio. Zato dugme za karticu gostima nije vidljivo. Ako nedostaje dokumentacija, ona je u njihovom obrascu.",
      cardDisabledTitle: "Plaćanje karticom je isključeno",
      cardDisabledBody:
        "Gosti plaćaju na licu mjesta. Račun kod {provider} i dalje postoji i može se ponovo uključiti.",
      cardConnectTitle: "Primajte kartice u jelovniku",
      cardConnectBody:
        "Gost plaća na svom telefonu za stolom, karticom, Apple Payem ili Google Payem. Ugovor sklapate direktno s procesorom i novac ide pravo na vaš račun — Burp nikada ne drži novac gosta.",
      cardUnavailableTitle: "Plaćanje karticom još nije dostupno",
      cardUnavailableBody:
        "Za {currency} još nije povezan nijedan procesor. Gost naručuje kao i obično i plaća na licu mjesta; iznos naplaćujete u Kasi.",
      cardContinue: "Nastavi kod procesora",
      cardConnect: "Poveži račun",
      cardTurnOff: "Isključi",
      cardTurnOffConfirm:
        "Isključiti plaćanje karticom? Gosti će tada moći platiti samo na licu mjesta.",
      cardTurnedOff: "Plaćanje karticom je isključeno.",
      cardOwnerOnly: "Samo vlasnik može povezati račun za plaćanje.",

      pageTitle: "Vaša stranica",
      pageHint: "Ovako vaš restoran izgleda gostima.",
      showPage: "Prikaži stranicu",
      presentation: "Opis",
      presentationPlaceholder: "Šta čini mjesto posebnim? Dvije rečenice su dovoljne.",
      presentationCount: "{n}/600 znakova. Stoji na vrhu vaše stranice i u rezultatima pretrage.",
      hero: "Glavna slika",
      heroHint:
        "Prikazuje se na vrhu vaše stranice i u listama. Burp pregleda sliku prije objave.",
      heroUpload: "Otpremi glavnu sliku",
      phone: "Telefon",
      cuisines: "Vrste kuhinje",
      cuisinesHint: "Odvojeno zarezom, najviše osam. Postaju filteri i vlastite stranice na Burpu.",
      priceTier: "Cjenovni razred",
      priceTierHint: "Kliknite ponovo da uklonite. Bez razreda ne prikazuje se nijedan.",
      address: "Adresa",
      street: "Ulica i broj",
      postalCode: "Poštanski broj",
      city: "Grad",
      mapPlace: "Mjesto na karti",
      mapHint:
        "Otvorite svoje mjesto u Google Mapsu i zalijepite link ovdje. Igla određuje upute koje gosti dobiju — adresa iznad koristi se samo kao tekst.",
      mapLinkLabel: "Link karte ili koordinate",
      mapCurrentHint:
        "Karta prikazuje mjesto koje je sada spremljeno. Ažurira se kad spremite novi link.",
      presentationSaved: "Spremljeno. Izmjene se vide na vašoj stranici u roku od sat vremena.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    menu: {
      intro:
        "Gostima se prikazuju samo objavljeni jelovnici i jela. Cijene se navode s uključenim PDV-om.",
      noMenuTitle: "Još nema jelovnika",
      noMenuBody:
        "Kreirajte prvi iznad. Restoran može imati više jelovnika — ručak, večer, vikend — i pravi se prikazuje prema danu i satu.",

      newMenu: "Novi jelovnik",
      newMenuPlaceholder: "Ručak, Večer, Vikend…",
      createMenu: "Kreiraj jelovnik",
      creating: "Kreiranje…",
      publish: "Objavi",
      unpublish: "Skini s objave",
      deleteAll: "Obriši sve",
      confirm: "Potvrdi",
      cancel: "Otkaži",
      remove: "Obriši",

      appliesOn: "Vrijedi",
      from: "Od",
      to: "Do",
      daySun: "Ned",
      dayMon: "Pon",
      dayTue: "Uto",
      dayWed: "Sri",
      dayThu: "Čet",
      dayFri: "Pet",
      daySat: "Sub",

      newCategory: "Nova kategorija",
      newCategoryPlaceholder: "Pizza, Piće, Desert…",
      removeCategory: "Ukloni kategoriju",
      add: "Dodaj",
      adding: "Dodavanje…",

      newItem: "Novo jelo",
      price: "Cijena ({currency})",
      itemName: "Naziv jela",
      inStock: "Na stanju",
      soldOutToday: "Rasprodano danas",
      hide: "Sakrij",
      details: "Detalji",
      description: "Opis",
      vat: "PDV",
      allergens: "Alergeni",
      allergensHint: "odvojeni zarezom",
      image: "Slika",
      imageHint:
        "Slika se gostu prikazuje tek kad je Burp odobri. JPEG, PNG, WebP ili AVIF, najviše 10 MB.",
      imagePending: "Čeka pregled: {n}",
      imageUploadFor: "Otpremi sliku za {name}",
      removeItem: "Ukloni jelo",

      optionGroups: "Grupe priloga",
      newGroup: "Nova grupa",
      newGroupPlaceholder: "Odaberi veličinu",
      min: "Najmanje",
      max: "Najviše",
      addGroup: "Dodaj grupu",
      removeGroup: "Ukloni grupu",

      somethingWrong: "Nešto je pošlo po zlu.",
      makeAvailable: "Ponovo učini dostupnim",
      soldUntil: "Rasprodano do",
      reasonForGuest: "Razlog za gosta",
      reasonPlaceholder: "Npr. Nema do petka",
      markSoldOut: "Označi kao rasprodano",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    tables: {
      title: "Stolovi i QR kodovi",
      intro: "Isprintajte kod i zalijepite ga na stol. Kod je statičan i ne mijenja se nikada.",
      emptyTitle: "Još nema stolova",
      emptyBody:
        "Dodajte prvi iznad. Svaki stol dobiva vlastiti QR kod za printanje i lijepljenje na stol.",

      tableNumber: "Broj stola",
      zone: "Zona",
      optional: "nije obavezno",
      zonePlaceholder: "Bašta",
      seats: "Mjesta",
      seatsCount: "{n} mjesta",
      addTable: "Dodaj stol",
      adding: "Dodavanje…",

      printAll: "Isprintaj sve kodove",
      locked: "Zaključan",
      lock: "Zaključaj stol",
      unlock: "Otključaj",
      confirm: "Potvrdi",
      cancel: "Otkaži",
      remove: "Ukloni",
      statusFailed: "Status stola nije promijenjen.",

      planTitle: "Tlocrt",
      planHint:
        "Razmjestite stolove kako stoje u lokalu. Pregled ih onda prikazuje u obliku prostorije umjesto kao mrežu — konobar tada vidi koji stol zove, a ne koje polje po redu.",
      planEmptyTitle: "Još nema tlocrta",
      planEmptyBody:
        "Nacrtajte lokal da Pregled može pokazati gdje stolovi zaista stoje. Konobar koji vidi prostoriju zna koji stol zove — lista govori samo koje polje po redu.",
      planSaved: "Tlocrt je spremljen.",
      somethingWrong: "Nešto je pošlo po zlu.",
      undo: "Poništi",
      rotate: "Zakreni",
      removeFromPlan: "Ukloni s tlocrta",
      notPlaced: "Nisu razmješteni",
      allPlaced: "Svi stolovi su na tlocrtu.",
      managePlans: "Upravljaj tlocrtima",
      newPlan: "Novi tlocrt",
      newPlanPlaceholder: "Npr. Bašta",
      add: "Dodaj",
      save: "Spremi",
      saving: "Spremanje…",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    reports: {
      statsEmptyTitle: "Nema završenih narudžbi u periodu",
      statsEmptyBody:
        "Statistika broji samo završene narudžbe — narudžba u redu nije promet.",
      revenue: "Promet",
      revenueInclVat: "Promet s PDV-om",
      inclVat: "s PDV-om",
      orders: "Narudžbe",
      tips: "Napojnica",
      tipsToStaff: "pripada osoblju",
      feeHint:
        "Novac gostiju ide pravo vama — Burp ga nikada ne drži. Naknada se skuplja mjesečno i fakturira naknadno; stoji na",
      feeHintAfter:
        ". Naknada procesora za karticu nije uključena, ona je između vas i vaše banke.",
      settlementLink: "Obračun",
      avgHint: "broj koji gost pamti",
      mostPopular: "Najpopularnije",
      revenuePerTable: "Promet po stolu",
      revenuePerTableHint:
        "Broj zbog kojeg QR narudžba postoji. Stolovi bez narudžbi prikazuju se kao nula.",

      reviewsTitle: "Ocjene",
      reviewsIntro:
        "Ocjenu mogu ostaviti samo gosti koji su završili narudžbu. Možete odgovoriti javno, ali ne možete promijeniti ocjenu ni tekst.",
      reviewsEmptyTitle: "Još nema ocjena",
      reviewsEmptyBody: "Doći će kad gosti počnu naručivati i kad im se narudžbe završe.",
      reviewsWorthLooking: "vrijedi pogledati",
      guest: "Gost",
      hiddenByBurp: "Sakrio Burp",
      ratingOnly: "Gost je ostavio samo ocjenu, bez teksta.",
      editReply: "Izmijeni odgovor",
      removeReply: "Ukloni odgovor",
      replyPublicly: "Odgovori javno",
      replyHintLow: "Smiren odgovor na nisku ocjenu koristi više nego nikakav odgovor.",
      replyPlaceholder: "Hvala što ste naručili…",

      settlementTitle: "Obračun",
      settlementIntro:
        "Naknada Burpa, skupljena po mjesecu i fakturirana naknadno. Novac gostiju ide pravo vama — nikada ne prolazi kroz Burp — pa je ovo jedino što se odavde plaća.",
      settlementOngoing: "U toku — još nije fakturirano",
      settlementClosed: "Zatvoreni periodi",
      settlementEmptyTitle: "Nijedan period još nije zatvoren",
      settlementEmptyBody:
        "Obračun nastaje kad mjesec završi. Do tada se samo zbraja gore.",
      settlementFrozenHint:
        "Naknada se čita iz redova zapisanih kad je svaka narudžba nastala, a ne iz današnjeg postotka — stari period pokazuje šta je tada zaista naplaćeno. Naknada procesora za karticu nije uključena; ona je između vas i vaše banke.",
      completedInPeriod: "završeno u periodu",
      tipsNotInFeeBase: "novac osoblja — ne ulazi u osnovicu naknade",
      refundedToGuests: "Vraćeno gostima",
      creditForRefunded: "Odobrenje za potpuno refundirane narudžbe",

      eventsTitle: "Događaji",
      eventsIntro:
        "Povrati i otkazane narudžbe, s tim ko stoji iza njih. Redovi dolaze iz zapisa koji se ne mogu naknadno mijenjati.",
      eventsEmptyBody: "Nijedan novac nije vraćen i nijedna narudžba nije otkazana.",
      eventRefund: "Povrat",
      eventCancelled: "Otkazana narudžba",
      eventsCancelHint:
        "Otkazana narudžba stoji s punim iznosom — to je ono što se nije dogodilo, a ne ono što je neko dobio nazad. Plaćanja karticom koja nikada nisu prošla vide se ovdje kao otkazana, a gost tada nikada nije ni terećen.",
      actorGuest: "sam gost",
      actorWebhook: "procesor plaćanja",
      actorSystem: "sistem",

      couponsIntro:
        "Kodovi za popust koje gost unosi na kasi. Popust se skida s računa — a time i s osnovice za naknadu Burpa, pa nikada ne plaćate naknadu na novac koji niste primili.",
      couponsVsGiftCards:
        "Izgledaju isto ali nisu: kupon je popust koji smanjuje račun, poklon kartica je unaprijed plaćen novac koji ga plaća.",
      giftCardsHere: "Nalaze se ovdje",
      newCoupon: "Novi kod",
      code: "Kod",
      codePlaceholder: "LJETO25",
      codeHint: "Slova i brojevi. Gost ga može upisati i malim slovima.",
      discount: "Popust",
      percent: "Postotak",
      fixedAmount: "Fiksni iznos",
      cap: "Gornja granica (nije obavezno)",
      amount: "Iznos",
      minimumBill: "Najmanji račun",
      none: "nema",
      validUntil: "Vrijedi do",
      totalCount: "Ukupan broj",
      unlimited: "neograničeno",
      perGuest: "Po gostu",
      create: "Kreiraj",
      creating: "Kreiranje…",
      cancel: "Otkaži",
      couponsEmptyTitle: "Još nema ponuda",
      couponsEmptyBody:
        "Kod za popust je način da vratite goste koji su već bili ovdje. Popust se skida s računa prije nego se obračuna naknada Burpa.",
      turnOff: "Isključi",
      turnOn: "Uključi",
      usedOf: "{used} od {total}",
      usedTimes: "{used} puta",
      inDiscount: "{amount} popusta",

      giftCardsTitle: "Poklon kartice",
      giftCardsIntro:
        "Unaprijed plaćena vrijednost koja se može iskoristiti samo kod vas. Stanje se računa iz transakcija i nikada se ne pohranjuje — kartica se može koristiti više puta dok se ne potroši.",
      giftCardIssued: "Poklon kartica je izdana",
      giftCardIssuedHint:
        "Napišite kod na karticu ili ga pošaljite gostu. Ostaje i na listi ispod.",
      copy: "Kopiraj",
      copied: "Gotovo",
      newGiftCard: "Nova poklon kartica",
      amountIn: "u {currency}",
      recipient: "Za",
      optional: "(nije obavezno)",
      recipientPlaceholder: "e-mail primaoca",
      note: "Napomena",
      notePlaceholder: "Npr. kompenzacija stol 4",
      issue: "Izdaj",
      giftCardsEmptyTitle: "Još nema poklon kartica",
      giftCardsEmptyBody:
        "Poklon kartica je unaprijed plaćena vrijednost kod vas. Može se koristiti više puta dok se ne potroši, a ostatak čeka sljedeći dolazak.",
      block: "Blokiraj",
      unblock: "Otključaj",
    },

    /* Se sv.ts. Skickas som result.message — aldrig som objekt. */
    errors: {
      menuNeedsName: "Jelovnik treba naziv.",
      nameTooLong: "Naziv je predug.",
      menuNeedsDay: "Jelovnik mora vrijediti bar jedan dan.",
      endAfterStart: "Vrijeme završetka mora biti poslije početka.",
      menuNoPublishedItems: "Jelovnik još nema objavljenih jela. Objavite bar jedno jelo.",
      categoryNeedsName: "Kategorija treba naziv.",
      itemNeedsName: "Jelo treba naziv.",
      itemNotFound: "Jelo nije pronađeno.",
      groupNeedsName: "Grupa treba naziv.",
      minAtLeastZero: "Najmanji broj mora biti 0 ili više.",
      maxAtLeastOne: "Najveći broj mora biti bar 1.",
      minNotAboveMax: "Najmanji broj ne može biti veći od najvećeg.",
      optionNeedsName: "Prilog treba naziv.",
      timeMustBeFuture: "Vrijeme mora biti u budućnosti — inače je jelo već dostupno.",

      onlyCashOrTerminal: "Ovdje se mogu evidentirati samo gotovina i kartica na terminalu.",
      onlyCompletedOrders:
        "Naplatiti se može samo završena narudžba. Prvo je označite kao serviranu.",
      orderAlreadyPaid: "Narudžba je već plaćena.",
      amountAboveZero: "Iznos mora biti veći od nule.",
      alreadySettledCash: "Narudžba je već naplaćena gotovinom.",
      alreadySettledTerminal: "Narudžba je već naplaćena na terminalu.",
      tableOrderAlreadySettled: "Jedna od narudžbi za stolom je već naplaćena.",
      refundNeedsReason: "Napišite zašto se račun vraća.",
      providerAccountNotFound: "Račun za plaćanje nije pronađen kod procesora.",
      paymentMissingReference: "Uplata nema referencu kod procesora.",
      providerUnknownError: "Nepoznata greška kod procesora.",
      providerRefundFailed: "Procesor nije mogao izvršiti povrat.",
      providerUnreachable: "Nije bilo moguće doći do procesora plaćanja. Pokušajte ponovo.",

      hoursOverlap:
        "{day}: smjena se preklapa s drugom. Zapamtite da noćna smjena prelazi u naredni dan.",
      hoursZeroLength: "{day}: otvara i zatvara u isto vrijeme.",
      hoursInvalidTime: "{day}: neispravno vrijeme. Koristite format 11:00.",

      editWindowRange: "Prozor za izmjene treba biti između 0 i 3600 sekundi.",
      streetRequired: "Ulica ne smije biti prazna.",
      cityRequired: "Grad ne smije biti prazan.",
      postalCodeInvalid: "Poštanski broj ne izgleda kao da važi u {country}.",
      priceTierRange: "Cjenovni razred mora biti 1–4.",
      locationUnreadable:
        "Iz toga se nije dalo pročitati mjesto. Zalijepite link iz Google Mapsa ili upišite koordinate kao 43.8595, 18.4287.",
      punchCardRange:
        "Broj dolazaka treba biti između 2 i 50. Kartica s jednim dolaskom nije kartica.",

      tableNumberRequired: "Broj stola je obavezan.",
      tableNumberTooLong: "Broj stola je predug.",
      qrCodeFailed: "Nije bilo moguće generisati jedinstven QR kod. Pokušajte ponovo.",

      replyEmpty: "Napišite nešto prije nego objavite odgovor.",
      replyTooLong: "Odgovor je predug. Neka bude ispod 2000 znakova.",

      couponCodeFormat: "Kod treba imati 3–32 znaka, samo slova i brojeve.",
      percentRange: "Postotak treba biti između 1 i 100.",
      capUnreadable: "Gornju granicu nije bilo moguće pročitati.",
      amountUnreadable: "Iznos nije bilo moguće pročitati.",
      minOrderUnreadable: "Najmanji iznos narudžbe nije bilo moguće pročitati.",
      endDateUnreadable: "Krajnji datum nije bilo moguće pročitati.",
      couponCodeExists: "Taj kod već postoji kod vas.",
      giftCardCodeFailed: "Nije bilo moguće kreirati jedinstven kod. Pokušajte ponovo.",

      imageNotYours: "Slika ne pripada vašem restoranu.",
      approvedImageSupport: "Odobrene slike uklanja Burp podrška.",
      subscriptionIncomplete: "Pretplata je bila nepotpuna.",

      emailRequired: "Upišite e-mail adresu.",
      invitationExists: "Za tu adresu već postoji otvoren poziv.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    image: {
      formatError: "Slika mora biti JPEG, PNG, WebP ili AVIF.",
      uploadedNotice:
        "Slika je otpremljena i čeka pregled. Gostu se prikazuje kad bude odobrena.",
    },

    /* Inbjudningssidan. Personen är inloggad men ännu inte personal. */
    invitation: {
      joinFailed: "Poziv nije bilo moguće iskoristiti.",
      joining: "Pridruživanje…",
      join: "Pridruži se",
    },

    upcomingLater: (count: number) => {
      const ones = count % 10;
      const tens = count % 100;

      const word =
        ones === 1 && tens !== 11
          ? "narudžba"
          : ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)
            ? "narudžbe"
            : "narudžbi";

      return `${count} ${word} kasnije danas.`;
    },
  },

  country: {
    BA: "Bosna i Hercegovina",
    HR: "Hrvatska",
    RS: "Srbija",
    SE: "Švedska",
  },

  weekday: {
    mon: "Ponedjeljak",
    tue: "Utorak",
    wed: "Srijeda",
    thu: "Četvrtak",
    fri: "Petak",
    sat: "Subota",
    sun: "Nedjelja",
  },
};
