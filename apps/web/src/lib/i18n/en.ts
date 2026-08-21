import type { Dictionary } from "./sv";

/**
 * English copy.
 *
 * Typed as `Dictionary`, which is derived from the Swedish file. A key added
 * there and forgotten here fails the build — a missing translation must never
 * reach a guest as an empty string.
 *
 * This is a translation, not a transliteration. Swedish "Hitta hit" is two
 * words that mean "find your way here"; the English heading is "Getting here",
 * because that is what an English speaker expects to see above a map.
 */
export const en: Dictionary = {
  site: {
    forRestaurants: "For restaurants",
    forGuests: "For guests",
    home: "Burp — home",
    tagline:
      "Every restaurant with a page of its own: menu, photos, opening hours and directions. Scan the QR code at your table and order — no app, no account.",
    cities: "Cities",
    cuisines: "Cuisines",
    restaurantsIn: (city: string) => `Restaurants in ${city}`,
    joinBurp: "List your restaurant",
    logIn: "Log in",
    createAccount: "Create guest account",
    myOrders: "My orders",
    breadcrumbs: "Breadcrumbs",
    allCities: "All cities",
    language: "Language",

    /* Header navigation. */
    discover: "Discover",
    map: "Map",
    becomePartner: "Become a partner",
    mainNav: "Main menu",
    searchLabel: "Search for a restaurant or dish",
    searchPlaceholder: "Search restaurants or dishes",
  },

  /* The map page, /upptack. */
  discover: {
    title: "Every restaurant on the map",
    intro:
      "See where the places are before you decide. Filter by cuisine, city and what is open right now.",
    openNow: "Open now",
    showAll: "Show all",
    sort: "Sort",
    sortRating: "Highest rated",
    sortName: "Name A–Z",
    mapLabel: "Map of the restaurants",
    mapEmpty: "None of the matches has a map pin yet.",
    mapFailed: "The map could not be loaded. The list beside it shows the same places.",
    results: "Matches",
    empty: "No restaurant matches the filter.",
    emptyHint: "Remove a filter, or search the whole marketplace.",
  },

  home: {
    label: "Food marketplace",
    headline: ["Every restaurant,", "a page of its own"],
    headlineCity: (city: string) => `Eat your way through ${city}.`,
    intro:
      "Menus with photos, opening hours and directions — and ordering straight from your table with a QR code. No app, no account.",
    searchLabel: "Search for a restaurant or dish",
    searchPlaceholder: "Search restaurant, dish or cuisine",
    searchButton: "Search",
    searchHint: "Searches restaurant names and descriptions.",
    city: "City",
    cuisine: "Cuisine",
    allCities: "All cities",
    allCuisines: "All cuisines",
    seeAllIn: (city: string) => `All in ${city}`,
    allRestaurants: "All restaurants",
    hits: (count: number) => (count === 1 ? "1 result" : `${count} results`),
    searchedFor: "Search",
    featured: "Featured",
    seeMenu: "See the menu",
    noRatings: "No reviews yet",
    ratingSummary: (average: string, count: number) =>
      `${average} out of 5 on average, ${count} reviews`,
    todayHours: (hours: string) => `Today ${hours}`,
    closedToday: "Closed today",
    emptyTitle: "No restaurants matched.",
    emptyFiltered: "Try another search, another city, or clear the filters.",
    emptyAll: "There are no active restaurants to show right now.",
    showAll: "Show all restaurants",
  },

  city: {
    label: "City",
    title: (city: string) => `Restaurants in ${city}`,
    intro: (count: number, city: string) =>
      `${count === 1 ? "One restaurant takes" : `${count} restaurants take`} orders through Burp in ${city}. Order for pickup, or scan the QR code at your table.`,
    cuisineLabel: (city: string) => `Cuisines in ${city}`,
    cuisineTitle: (cuisine: string, city: string) => `${cuisine} in ${city}`,
    cuisineIntro: (count: number, cuisine: string, city: string) =>
      `${count === 1 ? "One restaurant serves" : `${count} restaurants serve`} ${cuisine.toLowerCase()} in ${city}.`,
    cuisineMeta: (cuisine: string, city: string) =>
      `Order ${cuisine.toLowerCase()} in ${city}. Pickup, or order straight from your table — no app needed.`,
    otherCuisines: (city: string) => `Other cuisines in ${city}`,
    emptyTitle: "No restaurants here yet.",
    emptyBody: "Do you run a restaurant nearby?",
    emptyAction: "List your restaurant",
  },

  restaurant: {
    onThisPage: "On this page",
    menu: "Menu",
    findUs: "Getting here",
    reviews: "Reviews",
    orderForPickup: "Order for pickup",
    noMenuTitle: "No menu right now",
    noMenuBody: (name: string) =>
      `${name} has not published a menu for this time of day. Give them a call.`,
    openToday: (hours: string) => `Open today ${hours}`,
    closedToday: "Closed today",
    phone: "Phone",
    openingHours: "Opening hours",
    noOpeningHours: "No opening hours listed.",
    closed: "Closed",
    reviewSummary: (average: string, count: number) =>
      `${average} out of 5 based on ${count} ${count === 1 ? "review" : "reviews"} from completed orders.`,
    reviewsEmptyTitle: "No reviews yet",
    reviewsEmptyBody: "Ratings can only be left by guests who have actually ordered.",
    reviewAuthorFallback: "Guest",
    foodRating: "Food rating",
    serviceRating: "Service rating",
    ratingOutOf: "{n} out of 5",
    restaurantReply: "Reply from the restaurant",
  },

  menu: {
    table: "Table {number}",
    pickup: "Pickup",
    /* The table banner. Confirms to the guest that the code hit the right table. */
    noAppNoAccount: "No app. No account. Just order.",
    sections: "Menu sections",
    search: "Search the menu",
    searchPlaceholder: "Find a dish",
    searchClear: "Clear the search",
    searchEmpty: "Nothing on the menu matches “{query}”.",
    searchEmptyHint: "Try a shorter word, or browse the sections.",
    soldOut: "Sold out today",
    ongoingOrderLink: "See status and bill",
    ongoingOrder: "You have an order in progress",
    allergens: "Allergens",
    chooseOptions: "Choose options",
    hideOptions: "Hide options",
    add: "Add",
    added: "Added",
    priceFrom: "From {price}",
    chooseExactly: "choose {n}",
    chooseBetween: "choose {min}–{max}",
    chooseUpTo: "choose up to {n}",
    optionSoldOut: "(sold out)",
    chooseFirst: 'Choose from "{group}" first',
    noteToKitchen: "Note for the kitchen",
    notePlaceholder: "E.g. no onion",
    pickupTime: "When would you like to collect?",
    asSoonAsPossible: "As soon as possible",
    tip: "Tip",
    noTip: "None",
    foodAndDrink: "Food and drink",
    ofWhichVat: "of which VAT",
    hide: "Hide",
    itemCount: "{n} items",
    order: "Order",
    sending: "Sending…",
    removeOne: "Remove one {name}",
    addOne: "Add one {name}",
    orderFailed: "The order could not be placed. Please try again.",
    noConnection: "No connection to the server. Check your network and try again.",
    retrying: "No connection. Your order is saved and will be sent once you are back online.",
    retryNow: "Try now",
    retryGaveUp: "We cannot reach the server. Your order is saved — tap to try again.",

    payHow: "How would you like to pay?",
    payAtPlace: "In person",
    payByCard: "By card",
    payByCardHint: "Card, Apple Pay and Google Pay",
    payNow: "Pay",
    paying: "Paying…",
    paymentTitle: "Pay for your order",
    paymentCancel: "Cancel",
    paymentFailed: "The payment did not go through. Try again or pay in person.",
    paymentAbandoned: "The payment was cancelled. Your order was never placed.",

    coupon: "Discount code",
    couponPlaceholder: "e.g. SUMMER25",
    couponApply: "Apply",
    couponChecking: "Checking…",
    couponRemove: "Remove code",
    discount: "Discount",

    giftCard: "Gift card",
    giftCardPlaceholder: "ABCD-EFGH-JKLM",
    giftCardApply: "Use",
    giftCardChecking: "Checking…",
    giftCardRemove: "Remove gift card",
    giftCardLeft: "{amount} left afterwards",
    toPay: "To pay",

    punchCard: "Loyalty card",
    punchCardProgress: "{visits} of {size} visits",
    punchCardRemaining: "{n} visits to go until a free meal",
    punchCardEarned: "This meal is on the restaurant",
    punchCardUse: "Use the loyalty card",
  },

  table: {
    tooManyTitle: "Too many attempts",
    tooManyBody: "Wait a moment and scan the code again.",
    lockedTitle: "This table is not taking orders",
    lockedBody: "Ask a member of staff and they will help you.",
    closedTitle: "The restaurant is closed",
    closedBody: "Orders can only be placed during opening hours.",
    noMenuTitle: "No menu right now",
    noMenuBody: "The restaurant has not published a menu for this time of day. Ask a member of staff.",
  },

  receipt: {
    title: "Your order",
    table: "Table {number}",
    pickup: "Pickup",
    pickupAt: "Collect from",
    yourBill: "Your bill",
    foodAndDrink: "Food and drink",
    discount: "Discount",
    tip: "Tip",
    total: "Total",
    payOnPickup: "Payment is taken in person on collection.",
    payAtTable: "Payment is taken in person.",
    paidByCard: "Paid by card.",
    paidInTerminal: "Paid by card at the restaurant.",
    refundedNotice: "This order has been refunded.",
    notFiscalReceipt: "This is an order confirmation, not a fiscal receipt. The restaurant will give you the receipt.",

    reviewPrompt: "How was the food?",
    reviewOpen: "Leave a review",
    reviewFood: "Food",
    reviewService: "Service",
    reviewOptional: "optional",
    reviewComment: "Comment",
    reviewStar: "{n} out of 5",
    reviewSubmit: "Send",
    reviewSending: "Sending…",
    reviewCancel: "Cancel",
    reviewThanks: "Thank you. Your review helps the next guest.",
    reviewAlready: "You have already reviewed this order.",
    reviewFailed: "The review could not be saved. Please try again.",
    backTo: "Back to {name}",
    progress: "Order progress",
    contactRestaurant: "Contact the restaurant if you have any questions about your order.",
    enjoy: "Enjoy your meal",
    onTheWay: "Your food is on its way to the table.",
    minutesLeft: "About {n} minutes left.",
    almostReady: "Almost ready.",
    editTitle: "Change your order",
    editWindow: "You can make changes for another {n} seconds.",
    editExpired: "The time for changes has passed.",
    removeItem: "Remove a dish",
    remove: "Remove",
    cancelOrder: "Cancel the order",
    cancelWarning: "The whole order will be cancelled.",
    orderMore: "Order more",
    cancelConfirm: "Yes, cancel",
    cancelKeep: "Keep it",
    changeFailed: "The change did not go through.",
    status: {
      DRAFT: "Draft",
      PLACED: "Placed",
      ACCEPTED: "Accepted",
      PREPARING: "Being prepared",
      READY: "Ready",
      COMPLETED: "Served",
      CANCELLED: "Cancelled",
      REFUNDED: "Refunded",
    },
  },

  errors: {
    notFoundLabel: "404",
    notFoundTitle: "This page does not exist.",
    notFoundBody: "The address may have changed, or the restaurant may have stopped taking orders through Burp. Try one of the cities below.",
    notFoundAction: "Go to the home page",
    errorLabel: "Error",
    errorTitle: "Something went wrong.",
    errorBody: "That is on us, not on you. Try again — and if it still fails, calling the restaurant directly works just as well.",
    errorRetry: "Try again",
    loading: "Loading…",
  },

  directions: {
    copy: "Copy address",
    copied: "Copied",
    copiedNotice: "The address has been copied to your clipboard.",
    opensInNewTab: " — opens directions in a new tab",
    mapOf: (name: string) => `Map showing ${name}`,
  },

  staff: {
    home: "Burp — to the home page",
    navLabel: "Staff navigation",
    logOut: "Log out",
    language: "Language",
    languageSaving: "Saving…",
    languageError: "Could not save the language. Try again.",

    role: {
      owner: "Owner",
      manager: "Manager",
      staff: "Staff",
      kitchen: "Chef",
    },

    section: {
      oversikt: "Overview",
      order: "Orders",
      kok: "Kitchen screen",
      kassa: "Register",
      meny: "Menu",
      bord: "Tables & QR",
      erbjudanden: "Offers",
      omdomen: "Reviews",
      statistik: "Statistics",
      avrakning: "Settlement",
      handelser: "Events",
      personal: "Staff",
      installningar: "Settings",
    },

    status: {
      DRAFT: "Draft",
      PLACED: "Placed",
      ACCEPTED: "Accepted",
      PREPARING: "Preparing",
      READY: "Ready",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
      REFUNDED: "Refunded",
    },

    provider: {
      CASH: "Cash",
      TERMINAL: "Card in terminal",
      GIFT_CARD: "Gift card",
      STRIPE: "Card",
      MONRI: "Card",
    },

    kitchen: {
      live: "Orders live",
      sound: "Sound",
      soundOn: "on",
      soundOff: "off",
      empty: "No active orders.",
      updateFailed: "Could not update order: {message}",
      sibling: "Order {index} of {count} for the table",
      minutes: "{n} min",

      stepACCEPTED: "Accept",
      stepPREPARING: "Start cooking",
      stepREADY: "Ready",
      stepCOMPLETED: "Served",

      reject: "Reject",
      rejectConfirm: "Reject order",
      cancel: "Cancel",

      upcomingTitle: "Upcoming",
      upcomingHint: "Sent to the kitchen once only the prep time remains.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    orderType: {
      table: "Table {number}",
      TABLE: "Table",
      PICKUP: "Pickup",
      DELIVERY: "Delivery",
    },

    /* Kassan. ENBART strängar — skickas till klientkomponenter. */
    register: {
      toSettle: "To settle",
      emptyTitle: "Everything is settled",
      emptyBody: "Every completed order from the past day has a registered payment.",
      paidToday: "Paid today",
      paidTodayHint:
        "The record of the shift, cash and card. These rows cannot be edited — a mis-settlement is corrected with a counter-entry, not by rewriting history.",

      onSameBill: "{count} on the same bill",
      alreadyPaid: "{paid} already paid of {total}",
      showOrders: "Show the orders",
      hideOrders: "Hide the orders",

      amountReceived: "Amount received",
      method: "Payment method",
      settle: "Settle",
      settleTable: "Settle the whole table",
      settling: "Settling…",
      settleFailed: "The settlement did not go through.",

      closeBill: "Close the bill without settling",
      closeConfirm:
        "Close the bill without settling anything? The orders stay and can be settled one by one.",
      closeFailed: "The bill could not be closed.",

      over: "Over the bill by",
      under: "Under the bill by",
      spreadHint: "Spread across the orders at the table in proportion to what each one costs.",
      asEntered: "Registered as entered — rounding and in-house discounts should be visible.",
      unreadableAmount: "The amount could not be read.",

      servedAt: "Served {when}",
      paidOfTotal: "{paid} paid of {total}",
      billTotal: "bill {total}",
      refundedAmount: "refunded {amount}",
      remaining: "{amount} left",

      refund: "Refund",
      refunding: "Refunding…",
      refundFailed: "The refund did not go through.",
      refundAmount: "Amount",
      refundReason: "Reason",
      refundReasonPlaceholder: "E.g. cold soup",
      refundTooMuch: "More than what is left ({amount}).",
      cancel: "Cancel",

      refundHintGIFT_CARD: "The value goes back onto the gift card, not into the register.",
      refundHintCASH:
        "Registered as a counter-entry. You hand the notes back across the counter.",
      refundHintTERMINAL:
        "Registered as a counter-entry. You make the refund in the terminal — Burp cannot reach it.",
      refundHintPROVIDER: "Goes back to the card via the provider. May take a few days.",

      intro:
        "Completed orders from the past day. A table party stands as one bill and is settled in one go; the amount is spread across the orders for you. Card-paid orders are already settled by the provider.",
      tipsTitle: "Tips to share out",
      tipsCash: "{amount} in cash",
      tipsCard: "{amount} by card",
      tipsPending: "{amount} on bills not yet paid",
      tipsPeriod: "The past day",
      tipsHint:
        "Tips are the staff's money and count towards neither turnover nor Burp's fee. A refunded bill does not count.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    overview: {
      statOrders: "Orders today",
      statRevenue: "Turnover today",
      statAverage: "Average per order",
      statTips: "Tips today",
      statTipsHint: "the staff's, not the restaurant's",

      inKitchen: "In the kitchen right now",
      allOrders: "All orders",
      noOrdersTitle: "No orders right now",
      noOrdersBody: "New orders appear here as soon as a guest sends them.",

      tables: "Tables",
      tablesBusy: "{busy} of {total} occupied",
      noTablesTitle: "No tables set up",
      noTablesBody: "Set up the tables so you can print QR stickers.",
      noTablesAction: "Set up tables",

      stateLEDIGT: "Free",
      stateOPPEN_NOTA: "Open bill",
      stateBESTALLNING: "Order in",
      stateSERVERAS: "Ready to serve",
    },

    /* Personalsidan. ENBART strängar — skickas till klientkomponenter. */
    staffAdmin: {
      intro: "Who works here, in what role, and who has been invited but has not joined yet.",
      actionFailed: "The action did not go through.",

      inviteTitle: "Invite someone",
      inviteHint:
        "They get a link that is valid for seven days and only for the address you enter here.",
      email: "Email address",
      emailPlaceholder: "name@example.com",
      role: "Role",
      invite: "Invite",

      inviteCreated: "Invitation created",
      inviteSendYourself: "An email is on its way. You can also send the link yourself:",
      copy: "Copy",
      copied: "Copied",

      pendingTitle: "Awaiting a reply",
      validUntil: "valid until {date}",
      revoke: "Revoke",

      membersTitle: "Staff",
      you: "(you)",
      ended: "ended",
      end: "End",
      resume: "Resume",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    settings: {
      hoursTitle: "Opening hours",
      hoursHint:
        "Guests can only order while you are open. Several shifts a day for lunch and evening. If you close after midnight, write the closing time as it is — 22:00 to 02:00 means you are open until two in the morning.",
      cardTitle: "Card payments",
      cardHint:
        "The guest pays on their own phone. The agreement is yours, not Burp's — the money goes straight into your account.",
      notifyTitle: "Notifications",
      notifyHint:
        "The kitchen screen already chimes while it is open. This is for when it is not — the notification reaches the phone even if nobody is at the screen.",
      punchTitle: "Punch card",
      punchHint: "The tenth visit is on you. Counts visits, not amounts.",
      policyTitle: "Order rules",
      policyHint: "What the guest may change after ordering, and for how long.",

      saving: "Saving…",
      save: "Save",
      saveFailed: "Could not save.",
      somethingWrong: "Something went wrong.",
      saved: "Saved.",

      hoursSaved: "The opening hours are saved.",
      nextDay: "next day",
      remove: "Remove",
      openThisDay: "Open this day",
      addShift: "Add a shift",
      closedAllDay: "Closed all day",
      saveHours: "Save opening hours",
      nothingToSave: "Nothing to save",

      policySaved: "The order rules are saved.",
      autoAccept: "Accept orders automatically",
      autoAcceptHint:
        "Without this, someone has to press Accept on every order before the kitchen sees it.",
      prepTime: "Prep time",
      prepTimeUnit: "minutes",
      prepTimeHint: "Used to estimate the wait shown to the guest.",
      editWindow: "Edit window",
      editWindowUnit: "seconds",
      editWindowHint:
        "How long after ordering the guest may change the contents. 0 turns edits off entirely.",
      editUntil: "Edits allowed up to and including",
      editUntilHint: "After this status the guest can no longer make changes.",
      mayAdd: "The guest may add dishes",
      mayRemove: "The guest may remove dishes",
      mayChangeOptions: "The guest may change options",
      cancelUntil: "Cancellation allowed up to and including",
      cancelUntilHint:
        "Cancellation follows the status, not the edit window — a guest should be able to cancel as long as the food has not been started.",
      scheduled: "Accept pre-orders",
      scheduledHint:
        "The guest picks a time in advance. The order reaches the kitchen one prep time before it.",

      punchCard: "Punch card",
      punchCardBody:
        "After a set number of visits the meal is on you. Counts visits, not amounts — a coffee counts as much as a three-course dinner, and that is what brings people back.",
      visits: "Number of visits",
      cap: "Cap",
      capPlaceholder: "the whole bill",
      capHint: "Most you will cover, in {currency}. Empty = the whole bill.",
      loggedInOnly:
        "Applies to signed-in guests only. A guest at a table ordering anonymously cannot have visits counted — and should not.",

      pushNotConfigured:
        "Notifications are not switched on for the platform yet. The kitchen screen's sound works as usual.",
      pushUnsupported:
        "This browser cannot receive notifications. On iPhone it works once Burp has been added to the home screen.",
      pushBlocked:
        "Notifications are blocked for Burp in this browser. That can only be changed in the browser's own settings — we cannot ask again.",
      pushEnable: "Turn on for this device",
      pushDisable: "Turn off on this device",
      pushOnHint: "This device alerts when an order comes in.",
      pushOffHint:
        "Each device has to be turned on separately. If you have both a phone and a tablet, do it on both.",
      pushFailed: "The notifications could not be turned on.",

      cardOnTitle: "Card payments are on",
      cardOnBody:
        "Guests can pay by card, Apple Pay and Google Pay straight from the menu. The money goes to your own account at {provider} — Burp never receives it. Our fee is deducted from the payment.",
      cardPendingTitle: "Waiting for {provider}",
      cardPendingBody:
        "The account exists but {provider} has not approved it yet. That is why the card button is not showing for guests. If paperwork is missing, it is in their form.",
      cardDisabledTitle: "Card payments are off",
      cardDisabledBody:
        "Guests pay in person. The account at {provider} still exists and can be switched back on.",
      cardConnectTitle: "Accept cards in the menu",
      cardConnectBody:
        "The guest pays on their own phone at the table, by card, Apple Pay or Google Pay. You sign the agreement directly with the provider and the money goes straight into your account — Burp never holds the guest's money.",
      cardUnavailableTitle: "Card payments are not available yet",
      cardUnavailableBody:
        "No provider is connected for {currency} yet. The guest orders as usual and pays in person; you settle the amount in the Register.",
      cardContinue: "Continue with the provider",
      cardConnect: "Connect an account",
      cardTurnOff: "Turn off",
      cardTurnOffConfirm: "Turn off card payments? Guests will then only be able to pay in person.",
      cardTurnedOff: "Card payments turned off.",
      cardOwnerOnly: "Only the owner can connect a payment account.",

      pageTitle: "Your page",
      pageHint: "This is how your restaurant looks to guests.",
      showPage: "View the page",
      presentation: "Description",
      presentationPlaceholder: "What makes the place special? Two sentences will do.",
      presentationCount: "{n}/600 characters. Shown at the top of your page and in search results.",
      hero: "Main image",
      heroHint:
        "Shown at the top of your page and in the listings. Burp reviews the image before it is published.",
      heroUpload: "Upload a main image",
      phone: "Phone",
      cuisines: "Cuisines",
      cuisinesHint: "Comma separated, eight at most. Become filters and pages of their own on Burp.",
      priceTier: "Price range",
      priceTierHint: "Click again to remove. With no price range, none is shown.",
      address: "Address",
      street: "Street address",
      postalCode: "Postcode",
      city: "City",
      mapPlace: "Place on the map",
      mapHint:
        "Open your place in Google Maps and paste the link here. The pin drives the directions guests get — the address above is only used as text.",
      mapLinkLabel: "Map link or coordinates",
      mapCurrentHint:
        "The map shows the place saved right now. It updates once you have saved a new link.",
      presentationSaved: "Saved. The changes show on your page within an hour.",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    menu: {
      intro: "Only published menus and dishes are shown to guests. Prices include VAT.",
      noMenuTitle: "No menu yet",
      noMenuBody:
        "Create the first one above. A restaurant can have several menus — lunch, evening, weekend — and the right one is shown by weekday and time of day.",

      newMenu: "New menu",
      newMenuPlaceholder: "Lunch, Evening, Weekend…",
      createMenu: "Create menu",
      creating: "Creating…",
      publish: "Publish",
      unpublish: "Unpublish",
      deleteAll: "Delete everything",
      confirm: "Confirm",
      cancel: "Cancel",
      remove: "Delete",

      appliesOn: "Applies on",
      from: "From",
      to: "To",
      daySun: "Sun",
      dayMon: "Mon",
      dayTue: "Tue",
      dayWed: "Wed",
      dayThu: "Thu",
      dayFri: "Fri",
      daySat: "Sat",

      newCategory: "New category",
      newCategoryPlaceholder: "Pizza, Drinks, Dessert…",
      removeCategory: "Remove category",
      add: "Add",
      adding: "Adding…",

      newItem: "New dish",
      price: "Price ({currency})",
      itemName: "Name of the dish",
      inStock: "In stock",
      soldOutToday: "Sold out today",
      hide: "Hide",
      details: "Details",
      description: "Description",
      vat: "VAT",
      allergens: "Allergens",
      allergensHint: "comma separated",
      image: "Image",
      imageHint:
        "The image is shown to guests once Burp has approved it. JPEG, PNG, WebP or AVIF, 10 MB at most.",
      imagePending: "Awaiting review: {n}",
      imageUploadFor: "Upload an image for {name}",
      removeItem: "Remove the dish",

      optionGroups: "Option groups",
      newGroup: "New group",
      newGroupPlaceholder: "Choose a size",
      min: "At least",
      max: "At most",
      addGroup: "Add a group",
      removeGroup: "Remove the group",

      somethingWrong: "Something went wrong.",
      makeAvailable: "Make available again",
      soldUntil: "Sold out until",
      reasonForGuest: "Reason for the guest",
      reasonPlaceholder: "E.g. Sold out until Friday",
      markSoldOut: "Mark as sold out",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    tables: {
      title: "Tables and QR codes",
      intro: "Print the code and put it on the table. The code is static and never needs changing.",
      emptyTitle: "No tables yet",
      emptyBody:
        "Add the first one above. Every table gets a QR code of its own to print and put on the table.",

      tableNumber: "Table number",
      zone: "Zone",
      optional: "optional",
      zonePlaceholder: "Terrace",
      seats: "Seats",
      seatsCount: "{n} seats",
      addTable: "Add a table",
      adding: "Adding…",

      printAll: "Print every code",
      locked: "Locked",
      lock: "Lock the table",
      unlock: "Unlock",
      confirm: "Confirm",
      cancel: "Cancel",
      remove: "Remove",
      statusFailed: "The table status could not be changed.",

      planTitle: "Floor plan",
      planHint:
        "Drag the tables out so they stand as they do in the room. The overview then shows them in the shape of the room instead of as a grid — a waiter sees which table is calling, not which square in the order.",
      planEmptyTitle: "No floor plan yet",
      planEmptyBody:
        "Draw the room so the overview can show where the tables actually stand. A waiter who sees the room knows which table is calling — a list only says which square in the order.",
      planSaved: "The floor plan is saved.",
      somethingWrong: "Something went wrong.",
      undo: "Undo",
      rotate: "Rotate",
      removeFromPlan: "Remove from the plan",
      notPlaced: "Not placed",
      allPlaced: "Every table is on a plan.",
      managePlans: "Manage floor plans",
      newPlan: "New floor plan",
      newPlanPlaceholder: "E.g. The terrace",
      add: "Add",
      save: "Save",
      saving: "Saving…",
    },

    /* Se sv.ts. ENBART strängar — skickas till klientkomponenter. */
    reports: {
      statsEmptyTitle: "No completed orders in the period",
      statsEmptyBody:
        "Statistics only count completed orders — an order in the queue is not turnover.",
      revenue: "Turnover",
      revenueInclVat: "Turnover incl. VAT",
      inclVat: "incl. VAT",
      orders: "Orders",
      tips: "Tips",
      tipsToStaff: "goes to the staff",
      feeHint:
        "The guests' money goes straight to you — Burp never holds it. The fee is collected monthly and invoiced afterwards; it is shown under",
      feeHintAfter:
        ". The provider's card fee is not included, it sits between you and your acquirer.",
      settlementLink: "Settlement",
      avgHint: "the figure the guest remembers",
      mostPopular: "Most popular",
      revenuePerTable: "Turnover per table",
      revenuePerTableHint:
        "The figure QR ordering exists to be able to give. Tables without orders show as zero.",

      reviewsTitle: "Reviews",
      reviewsIntro:
        "Ratings can only be left by guests who completed an order. You can reply publicly, but you cannot change the rating or the text.",
      reviewsEmptyTitle: "No reviews yet",
      reviewsEmptyBody: "They arrive once guests start ordering and their orders are completed.",
      reviewsWorthLooking: "worth a look",
      guest: "Guest",
      hiddenByBurp: "Hidden by Burp",
      ratingOnly: "The guest left a rating only, no text.",
      editReply: "Edit the reply",
      removeReply: "Remove the reply",
      replyPublicly: "Reply publicly",
      replyHintLow: "A measured reply to a low rating does more good than no reply at all.",
      replyPlaceholder: "Thank you for ordering…",

      settlementTitle: "Settlement",
      settlementIntro:
        "Burp's fee, collected monthly and invoiced afterwards. The guests' money goes straight to you — it never passes through Burp — so this is the only thing to be paid from here.",
      settlementOngoing: "Ongoing — not invoiced yet",
      settlementClosed: "Closed periods",
      settlementEmptyTitle: "No period is closed yet",
      settlementEmptyBody:
        "A settlement is created when the month ends. Until then it only adds up above.",
      settlementFrozenHint:
        "The fee is read from the rows written when each order was placed, not from today's percentage — an old period shows what was actually charged then. The provider's card fee is not included; it sits between you and your acquirer.",
      completedInPeriod: "completed in the period",
      tipsNotInFeeBase: "the staff's money — not part of the fee base",
      refundedToGuests: "Refunded to guests",
      creditForRefunded: "Credit for fully refunded orders",

      eventsTitle: "Events",
      eventsIntro:
        "Refunds and cancelled orders, with who was behind them. The rows come from logs that cannot be rewritten afterwards.",
      eventsEmptyBody: "No money has been given back and no order has been cancelled.",
      eventRefund: "Refund",
      eventCancelled: "Cancelled order",
      eventsCancelHint:
        "A cancelled order stands at its full amount — that is what did not happen, not what anyone got back. Card payments that never went through appear here as cancelled, and the guest was never charged.",
      actorGuest: "the guest",
      actorWebhook: "the payment provider",
      actorSystem: "the system",

      couponsIntro:
        "Discount codes the guest enters at checkout. The discount comes off the bill — and therefore off the base for Burp's fee, so you never pay a fee on money you did not take in.",
      couponsVsGiftCards:
        "They look like the same thing but are not: a coupon is a discount that lowers the bill, a gift card is prepaid money that pays it.",
      giftCardsHere: "They live here",
      newCoupon: "New code",
      code: "Code",
      codePlaceholder: "SUMMER25",
      codeHint: "Letters and digits. The guest can type it in lower case.",
      discount: "Discount",
      percent: "Percentage",
      fixedAmount: "Fixed amount",
      cap: "Cap (optional)",
      amount: "Amount",
      minimumBill: "Minimum bill",
      none: "none",
      validUntil: "Valid until",
      totalCount: "Total count",
      unlimited: "unlimited",
      perGuest: "Per guest",
      create: "Create",
      creating: "Creating…",
      cancel: "Cancel",
      couponsEmptyTitle: "No offers yet",
      couponsEmptyBody:
        "A discount code is a way to bring back guests who came once. The discount comes off the bill before Burp's fee is counted.",
      turnOff: "Turn off",
      turnOn: "Turn on",
      usedOf: "{used} of {total}",
      usedTimes: "{used} times",
      inDiscount: "{amount} in discount",

      giftCardsTitle: "Gift cards",
      giftCardsIntro:
        "Prepaid value that can only be redeemed with you. The balance is computed from the transactions and never stored — a card can be used several times until it runs out.",
      giftCardIssued: "The gift card is issued",
      giftCardIssuedHint:
        "Write the code on the card or send it to the guest. It stays in the list below.",
      copy: "Copy",
      copied: "Done",
      newGiftCard: "New gift card",
      amountIn: "in {currency}",
      recipient: "To",
      optional: "(optional)",
      recipientPlaceholder: "the recipient's email",
      note: "Note",
      notePlaceholder: "E.g. compensation table 4",
      issue: "Issue",
      giftCardsEmptyTitle: "No gift cards yet",
      giftCardsEmptyBody:
        "A gift card is prepaid value with you. It can be used several times until it runs out, and the rest waits for the next visit.",
      block: "Block",
      unblock: "Unblock",
    },

    upcomingLater: (count: number) =>
      count === 1 ? "1 pre-order later today." : `${count} pre-orders later today.`,
  },

  weekday: {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  },
};
