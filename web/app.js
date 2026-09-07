"use strict";

(function () {
  var paths = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
    layers: '<path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6"/>',
    code: '<path d="m7 6-5 6 5 6m10-12 5 6-5 6m-4-14-2 16"/>',
    sprout:
      '<path d="M12 21v-8M12 13C5 14 3 10 3 5c6 0 9 2 9 8Zm0 3c0-8 3-11 9-11 0 6-2 9-9 11Z"/>',
    globe:
      '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    language:
      '<path d="M2 5h12M8 2v3m3 0c0 7-5 11-9 12m2-9c1 4 4 7 8 9m1 4 5-13 5 13m-8-5h6"/>',
    briefcase:
      '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c6 3 12 3 18 0M10 13h4v3h-4z"/>',
    book: '<path d="M12 5C8 2 5 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-6-2-10 1Zm0 0v16"/>',
    file: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8m-8 4h8"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    sliders:
      '<path d="M4 4v5m0 5v6m8-16v10m0 5v1m8-16v1m0 5v10M1 9h6m2 5h6m2-9h6"/>',
    download: '<path d="M12 2v13m-5-5 5 5 5-5M3 16v6h18v-6"/>',
    rss: '<circle cx="5" cy="19" r="1"/><path d="M4 10a10 10 0 0 1 10 10M4 3a17 17 0 0 1 17 17"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    external: '<path d="M14 3h7v7M10 14 21 3M11 3H3v18h18v-8"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  };
  function icon(name) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.file) +
      "</svg>"
    );
  }
  function e(value) {
    return String(value == null ? "" : value).replace(
      /[&<>"']/g,
      function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[char];
      }
    );
  }
  function safeUrl(value) {
    try {
      var u = new URL(value);
      return /^https?:$/.test(u.protocol) && !u.username && !u.password
        ? u.toString()
        : "";
    } catch (err) {
      return "";
    }
  }
  function link(value, label, className) {
    var u = safeUrl(value);
    return u
      ? '<a href="' +
          e(u) +
          '" target="_blank" rel="noopener noreferrer"' +
          (className ? ' class="' + e(className) + '"' : "") +
          ">" +
          e(label) +
          " ↗</a>"
      : e(label);
  }
  function $(id) {
    return document.getElementById(id);
  }
  function readLocal(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (err) {
      return fallback;
    }
  }
  function writeLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }
  var storedIds = readLocal("sarkari-saved-v1", []);
  var state = {
    lang: readLocal("sarkari-language", "en") === "hi" ? "hi" : "en",
    view: "explore",
    kind: "",
    category: "",
    q: "",
    region: "",
    persona: "",
    namespace: "",
    freshness: "",
    offset: 0,
    limit: 12,
    saved: new Set(
      Array.isArray(storedIds)
        ? storedIds
            .filter(function (s) {
              return typeof s === "string";
            })
            .slice(0, 100)
        : []
    ),
    meta: null,
    request: 0,
  };
  var translations = {
    workspace: ["YOUR WORKSPACE", "आपका कार्यक्षेत्र"],
    explore: ["Explore opportunities", "अवसर खोजें"],
    saved: ["Saved collection", "सहेजे गए अवसर"],
    underhood: ["BEHIND THE DATA", "डेटा के पीछे"],
    sources: ["Sources & coverage", "स्रोत और कवरेज"],
    developers: ["Developer API", "डेवलपर API"],
    openTitle: [
      "Public information.<br />Open possibilities.",
      "सार्वजनिक जानकारी।<br />खुली संभावनाएँ।",
    ],
    openText: [
      "Built in the open, for everyone.",
      "सबके लिए, खुले तौर पर निर्मित।",
    ],
    github: ["Explore the project", "प्रोजेक्ट देखें"],
    independent: [
      "Independent. Not a government service.",
      "स्वतंत्र। सरकारी सेवा नहीं।",
    ],
    atlas: ["Public opportunity atlas", "सार्वजनिक अवसर खोज"],
    eyebrow: ["INFORMATION THAT OPENS DOORS", "जानकारी जो रास्ते खोलती है"],
    heroTitle: [
      "One place.<br /><span>More possibilities.</span>",
      "एक जगह।<br /><span>अनेक संभावनाएँ।</span>",
    ],
    heroText: [
      "Discover jobs, schemes and learning resources.<br />Know the source. Make your next move.",
      "नौकरियाँ, योजनाएँ और अध्ययन संसाधन खोजें।<br />स्रोत जानें। अगला कदम बढ़ाएँ।",
    ],
    subscribe: ["Follow the opportunity feed", "अवसरों की RSS फ़ीड पाएँ"],
    curated: ["YOUR NEXT CHAPTER", "आपका अगला अध्याय"],
    export: ["Export data", "डेटा डाउनलोड"],
    filters: ["Filters", "फ़िल्टर"],
    persona: ["Looking for", "किसके लिए"],
    sourceType: ["Source type", "स्रोत का प्रकार"],
    review: ["Review freshness", "समीक्षा की नवीनता"],
    clear: ["Reset filters", "फ़िल्टर हटाएँ"],
    matchNote: [
      "Matching is based on recorded criteria, not a confirmation of eligibility.",
      "मिलान दर्ज मानदंडों पर आधारित है, पात्रता की पुष्टि नहीं।",
    ],
    sourceLed: ["Source-linked. No guesswork.", "स्रोत से जुड़ा। बिना अनुमान।"],
    footer: [
      "A little more clarity. A lot more possibility.",
      "थोड़ी और स्पष्टता। ढेर सारी संभावनाएँ।",
    ],
    footerNote: [
      "Always confirm details with the original source. This is an independent catalogue.",
      "मूल स्रोत से विवरण की पुष्टि करें। यह एक स्वतंत्र सूची है।",
    ],
    all: ["All opportunities", "सभी अवसर"],
    scheme: ["Schemes", "योजनाएँ"],
    job: ["Jobs", "नौकरियाँ"],
    paper: ["Exam papers", "प्रश्नपत्र"],
    policy: ["Policies", "नीतियाँ"],
    find: ["Find an opportunity", "अपने लिए अवसर खोजें"],
    allCategories: ["All categories", "सभी श्रेणियाँ"],
    details: ["View details", "विवरण देखें"],
    noResults: ["A fresh start for your search", "अपनी खोज फिर शुरू करें"],
    noResultsText: [
      "No opportunities match these filters. Try a broader search or another category.",
      "इन फ़िल्टर से कोई अवसर नहीं मिला। दूसरी श्रेणी या व्यापक खोज आज़माएँ।",
    ],
    noData: ["Your catalogue starts here", "आपकी सूची यहाँ से शुरू होती है"],
    noDataText: [
      "Import a tracker snapshot or your scraper’s JSON output. The explorer never invents opportunities or fetches websites on a visitor’s request.",
      "ट्रैकर डेटा या स्क्रेपर का JSON आयात करें। एक्सप्लोरर काल्पनिक अवसर नहीं बनाता।",
    ],
    noSaved: ["Keep a little possibility for later", "अवसर बाद के लिए सहेजें"],
    noSavedText: [
      "Use the bookmark on any card. Your collection stays in this browser, without an account.",
      "कार्ड पर बुकमार्क दबाएँ। संग्रह बिना खाते के इस ब्राउज़र में रहता है।",
    ],
    save: ["Save opportunity", "अवसर सहेजें"],
    unsave: ["Remove from saved", "संग्रह से हटाएँ"],
    added: ["Saved to your collection", "आपके संग्रह में सहेजा गया"],
    removed: ["Removed from your collection", "आपके संग्रह से हटाया गया"],
    error: ["We couldn’t load the catalogue", "सूची लोड नहीं हो सकी"],
    retry: ["Try again", "पुनः प्रयास करें"],
    original: ["Visit original source", "मूल स्रोत देखें"],
    apply: ["Application portal", "आवेदन पोर्टल"],
    benefit: ["Benefits as recorded", "दर्ज लाभ"],
    eligibility: ["Eligibility as recorded", "दर्ज पात्रता"],
    evidence: ["Evidence & provenance", "साक्ष्य और स्रोत"],
    documents: ["Documents & links", "दस्तावेज़ और लिंक"],
    verifiedDate: ["Upstream review date", "मूल स्रोत की समीक्षा तिथि"],
    importedDate: ["Imported into catalogue", "सूची में आयात तिथि"],
    notReviewed: ["Not independently reviewed", "स्वतंत्र समीक्षा नहीं हुई"],
    detailsNote: [
      "A source’s status or a matching profile is not an eligibility decision. Check the official notice before applying.",
      "स्रोत की स्थिति या मिलान पात्रता का निर्णय नहीं है। आवेदन से पहले आधिकारिक सूचना देखें।",
    ],
    demo: ["Illustrative demo", "उदाहरण डेमो"],
    demoNote: [
      "Demo mode — these are fictional examples, not live jobs or government schemes. Import real data to build your catalogue.",
      "डेमो मोड — ये काल्पनिक उदाहरण हैं, वास्तविक नौकरियाँ या योजनाएँ नहीं। वास्तविक डेटा आयात करें।",
    ],
    copied: ["Copied to clipboard", "क्लिपबोर्ड पर कॉपी हुआ"],
    copy: ["Copy", "कॉपी करें"],
  };
  var categories = {
    education: ["Education", "शिक्षा"],
    employment: ["Employment", "रोज़गार"],
    agriculture: ["Agriculture", "कृषि"],
    skilling: ["Skills & training", "कौशल प्रशिक्षण"],
    industry: ["Enterprise", "उद्यम"],
    social_welfare: ["Social welfare", "सामाजिक कल्याण"],
    health: ["Health", "स्वास्थ्य"],
    women_child: ["Women & children", "महिला एवं बाल"],
    housing: ["Housing", "आवास"],
    financial_inclusion: ["Financial support", "वित्तीय सहायता"],
  };
  function t(key) {
    return translations[key]
      ? translations[key][state.lang === "hi" ? 1 : 0]
      : key;
  }
  function category(key) {
    return categories[key]
      ? categories[key][state.lang === "hi" ? 1 : 0]
      : key.replace(/_/g, " ");
  }
  function local(value) {
    return value ? value[state.lang] || value.en || value.hi || "" : "";
  }
  function dateLabel(value) {
    if (!value) return t("notReviewed");
    var d = new Date(value);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString(state.lang === "hi" ? "hi-IN" : "en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });
  }
  function kindIcon(kind) {
    return (
      { job: "briefcase", scheme: "sprout", paper: "book", policy: "file" }[
        kind
      ] || "compass"
    );
  }
  function paintIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = icon(el.dataset.icon);
    });
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      $("toast").hidden = true;
    }, 3000);
  }
  async function api(url) {
    var response = await fetch(url);
    if (!response.ok) {
      var error = new Error("HTTP " + response.status);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  function params() {
    var p = new URLSearchParams();
    [
      "kind",
      "category",
      "q",
      "region",
      "persona",
      "namespace",
      "freshness",
    ].forEach(function (k) {
      if (state[k]) p.set(k, state[k]);
    });
    p.set("limit", state.limit);
    p.set("offset", state.offset);
    return p;
  }
  function updateLanguage() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.innerHTML = t(el.dataset.i18n);
    });
    $("language-label").textContent =
      state.lang === "en" ? "हिन्दी" : "English";
    $("search").placeholder =
      state.lang === "hi"
        ? "योजना, नौकरी, परीक्षा खोजें…"
        : "Search schemes, jobs, exams…";
    [
      [
        "region-filter",
        [
          ["All regions", "सभी क्षेत्र"],
          ["Bihar", "बिहार"],
          ["India-wide", "भारत भर"],
        ],
      ],
      [
        "persona-filter",
        [
          ["Everyone", "सभी"],
          ["Students", "विद्यार्थी"],
          ["Job seekers", "नौकरी चाहने वाले"],
          ["Farmers", "किसान"],
          ["Entrepreneurs", "उद्यमी"],
          ["Senior citizens", "वरिष्ठ नागरिक"],
          ["Workers", "कामगार"],
        ],
      ],
      [
        "namespace-filter",
        [
          ["All source types", "सभी स्रोत प्रकार"],
          ["gov.in / nic.in namespace", "gov.in / nic.in नामस्थान"],
          ["Historical directory only", "केवल ऐतिहासिक सूची"],
          ["Other / unclassified", "अन्य / अवर्गीकृत"],
        ],
      ],
      [
        "freshness-filter",
        [
          ["Any review date", "कोई भी समीक्षा तिथि"],
          ["Reviewed within 90 days", "90 दिनों में समीक्षित"],
          ["Needs a new review", "नई समीक्षा आवश्यक"],
          ["Not independently reviewed", "स्वतंत्र समीक्षा नहीं"],
        ],
      ],
    ].forEach(function (entry) {
      Array.from($(entry[0]).options).forEach(function (option, i) {
        option.textContent = entry[1][i][state.lang === "hi" ? 1 : 0];
      });
    });
    $("saved-count").textContent = state.saved.size;
    $("breadcrumb-current").textContent = t(
      state.view === "explore" ? "explore" : state.view
    );
    if (state.meta) renderMeta();
  }
  function renderMeta() {
    var m = state.meta;
    $("snapshot-state").textContent = m.demo
      ? t("demo")
      : m.updatedAt
        ? (state.lang === "hi" ? "स्नैपशॉट · " : "Snapshot · ") +
          dateLabel(m.updatedAt)
        : "No imported data";
    $("notice").hidden = !m.demo && !m.error;
    $("notice").textContent = m.demo ? t("demoNote") : m.error || "";
    $("stats").innerHTML = ["scheme", "job", "paper", "policy"]
      .map(function (kind) {
        return (
          '<button class="stat-card" data-kind="' +
          kind +
          '"><span class="stat-icon">' +
          icon(kindIcon(kind)) +
          '</span><span><strong class="stat-number">' +
          m.stats.kinds[kind].toLocaleString("en-IN") +
          '</strong><span class="stat-label">' +
          e(t(kind)) +
          '</span></span><span class="stat-arrow">↗</span></button>'
        );
      })
      .join("");
    renderTabs();
  }
  function renderTabs() {
    if (!state.meta) return;
    $("kind-tabs").innerHTML = ["", "scheme", "job", "paper", "policy"]
      .map(function (kind) {
        return (
          '<button class="tab ' +
          (state.kind === kind ? "active" : "") +
          '" data-kind="' +
          kind +
          '" aria-pressed="' +
          (state.kind === kind) +
          '">' +
          icon(kindIcon(kind)) +
          e(t(kind || "all")) +
          '<span class="tab-count">' +
          (kind ? state.meta.stats.kinds[kind] : state.meta.stats.total) +
          "</span></button>"
        );
      })
      .join("");
    var cats = state.meta.stats.categories;
    $("category-chips").innerHTML = [""]
      .concat(cats)
      .map(function (cat) {
        return (
          '<button class="chip ' +
          (state.category === cat ? "active" : "") +
          '" data-category="' +
          e(cat) +
          '" aria-pressed="' +
          (state.category === cat) +
          '">' +
          e(cat ? category(cat) : t("allCategories")) +
          "</button>"
        );
      })
      .join("");
  }
  function statusLabel(record) {
    if (state.meta && state.meta.demo) return t("demo");
    if (record.status === "unverified")
      return state.lang === "hi"
        ? "मूल सूचना की जाँच करें"
        : "Check original notice";
    var labels = {
      active: ["Source reports active", "स्रोत के अनुसार सक्रिय"],
      likely_active: [
        "Source reports likely active",
        "स्रोत के अनुसार संभवतः सक्रिय",
      ],
      dormant: ["Source reports dormant", "स्रोत के अनुसार निष्क्रिय"],
      unknown: ["Status needs confirmation", "स्थिति की पुष्टि आवश्यक"],
      subsumed: ["Source reports subsumed", "स्रोत के अनुसार समाहित"],
      superseded: ["Superseded", "अधिक्रमित"],
      lapsed: ["Source reports lapsed", "स्रोत के अनुसार समाप्त"],
      deadline_passed: ["Recorded deadline passed", "दर्ज अंतिम तिथि बीत गई"],
      consultation_open: ["Recorded consultation window", "दर्ज परामर्श अवधि"],
      draft: ["Draft · check consultation", "मसौदा · परामर्श देखें"],
      period_ended: ["Recorded policy period ended", "दर्ज नीति अवधि समाप्त"],
      upcoming: ["Recorded future start date", "दर्ज भविष्य की प्रारंभ तिथि"],
    };
    return labels[record.status]
      ? labels[record.status][state.lang === "hi" ? 1 : 0]
      : record.status;
  }
  function card(record) {
    var saved = state.saved.has(record.id);
    var sourceLabel =
      record.domain && record.domain.namespace
        ? record.domain.namespace + (state.lang === "hi" ? " स्रोत" : " source")
        : record.source.lastVerified
          ? (state.lang === "hi" ? "समीक्षा " : "Reviewed ") +
            dateLabel(record.source.lastVerified)
          : t("notReviewed");
    var id = e(record.id);
    return (
      '<article class="opportunity-card"><div class="card-top"><span class="kind-badge ' +
      e(record.kind) +
      '">' +
      icon(kindIcon(record.kind)) +
      e(t(record.kind)) +
      '</span><button class="save-button ' +
      (saved ? "saved" : "") +
      '" data-save="' +
      id +
      '" aria-label="' +
      e(t(saved ? "unsave" : "save")) +
      '" aria-pressed="' +
      saved +
      '">' +
      icon("bookmark") +
      '</button></div><button class="card-title" data-detail="' +
      id +
      '">' +
      e(local(record.title)) +
      '</button><p class="card-description">' +
      e(
        local(record.summary) ||
          local(record.benefits) ||
          (state.lang === "hi"
            ? "विवरण और स्रोत लिंक देखें।"
            : "Explore the details and original source links.")
      ) +
      '</p><div class="card-tags"><span>' +
      icon("pin") +
      e(
        record.region === "bihar"
          ? "Bihar"
          : record.region === "india"
            ? state.lang === "hi"
              ? "भारत"
              : "India-wide"
            : state.lang === "hi"
              ? "स्थान स्रोत पर देखें"
              : "Location in source"
      ) +
      "</span><span>" +
      e(category(record.categories[0] || record.kind)) +
      '</span></div><div class="status-line ' +
      (record.status === "unverified" ||
      record.status === "unknown" ||
      record.status === "deadline_passed"
        ? "warn"
        : "") +
      '"><span class="tiny-dot"></span>' +
      e(statusLabel(record)) +
      '</div><div class="card-meta"><span class="source-badge ' +
      (!record.source.lastVerified ? "neutral" : "") +
      '" title="A namespace or upstream review is not independent verification.">' +
      icon(record.domain && record.domain.namespace ? "globe" : "clock") +
      e(sourceLabel) +
      '</span><button class="details-button" data-detail="' +
      id +
      '">' +
      e(t("details")) +
      icon("arrow") +
      "</button></div></article>"
    );
  }
  function empty(title, description, action, command) {
    return (
      '<div class="empty-state">' +
      icon(action === "retry" ? "globe" : "compass") +
      "<h3>" +
      e(t(title)) +
      "</h3><p>" +
      e(t(description)) +
      "</p>" +
      (command ? '<code class="empty-command">' + e(command) + "</code>" : "") +
      (action
        ? '<button class="outline-button" data-action="' +
          action +
          '">' +
          e(
            t(
              action === "retry"
                ? "retry"
                : action === "explore"
                  ? "explore"
                  : "clear"
            )
          ) +
          "</button>"
        : "") +
      "</div>"
    );
  }
  async function loadResults() {
    var request = ++state.request;
    $("results").setAttribute("aria-busy", "true");
    $("results").innerHTML = '<div class="loading-card"></div>'.repeat(3);
    $("pagination").innerHTML = "";
    try {
      var response;
      if (state.view === "saved") {
        var values = await Promise.all(
          Array.from(state.saved).map(async function (id) {
            try {
              return await api(
                "/api/v1/opportunities/" + encodeURIComponent(id)
              );
            } catch (error) {
              if (error.status === 404) return null;
              throw error;
            }
          })
        );
        var available = values.filter(Boolean);
        response = {
          total: available.length,
          results: available.slice(state.offset, state.offset + state.limit),
        };
      } else {
        response = await api("/api/v1/opportunities?" + params());
      }
      if (request !== state.request) return;
      $("results-count").innerHTML =
        "<strong>" +
        response.total.toLocaleString("en-IN") +
        "</strong> " +
        (state.lang === "hi" ? "अवसर" : "opportunities") +
        (state.view === "saved"
          ? state.lang === "hi"
            ? " आपके संग्रह में"
            : " in your collection"
          : "");
      if (!response.results.length) {
        if (state.view === "saved")
          $("results").innerHTML = empty("noSaved", "noSavedText", "explore");
        else if (!state.meta.stats.total)
          $("results").innerHTML = empty(
            "noData",
            "noDataText",
            null,
            "npm run catalog:import -- --tracker-github"
          );
        else
          $("results").innerHTML = empty("noResults", "noResultsText", "clear");
      } else $("results").innerHTML = response.results.map(card).join("");
      var pages = Math.ceil(response.total / state.limit);
      if (pages > 1)
        $("pagination").innerHTML =
          '<button data-page="-1" ' +
          (!state.offset ? "disabled" : "") +
          ">← " +
          (state.lang === "hi" ? "पिछला" : "Previous") +
          "</button><span>" +
          (Math.floor(state.offset / state.limit) + 1) +
          " / " +
          pages +
          '</span><button data-page="1" ' +
          (state.offset + state.limit >= response.total ? "disabled" : "") +
          ">" +
          (state.lang === "hi" ? "अगला" : "Next") +
          " →</button>";
      $("download-json").href = "/api/v1/export?format=json&" + params();
    } catch (error) {
      if (request !== state.request) return;
      $("results-count").textContent = t("error");
      $("results").innerHTML = empty("error", "footerNote", "retry");
    } finally {
      if (request === state.request)
        $("results").setAttribute("aria-busy", "false");
    }
  }
  function resetFilters() {
    [
      "kind",
      "category",
      "q",
      "region",
      "persona",
      "namespace",
      "freshness",
    ].forEach(function (k) {
      state[k] = "";
    });
    [
      "search",
      "region-filter",
      "persona-filter",
      "namespace-filter",
      "freshness-filter",
    ].forEach(function (id) {
      $(id).value = "";
    });
    state.offset = 0;
    $("filter-dot").hidden = true;
    renderTabs();
    loadResults();
  }
  function save(id) {
    if (!state.saved.has(id) && state.saved.size >= 100) {
      toast("This browser collection is limited to 100 records.");
      return;
    }
    var adding = !state.saved.has(id);
    if (adding) state.saved.add(id);
    else state.saved.delete(id);
    var persisted = writeLocal("sarkari-saved-v1", Array.from(state.saved));
    $("saved-count").textContent = state.saved.size;
    document.querySelectorAll("[data-save]").forEach(function (button) {
      if (button.dataset.save !== id) return;
      button.classList.toggle("saved", adding);
      button.setAttribute("aria-pressed", String(adding));
      button.setAttribute("aria-label", t(adding ? "unsave" : "save"));
      if (button.classList.contains("outline-button"))
        button.innerHTML = icon("bookmark") + e(t(adding ? "unsave" : "save"));
    });
    toast(
      persisted
        ? t(adding ? "added" : "removed")
        : "Saved for this session only; browser storage is unavailable."
    );
    if (state.view === "saved") loadResults();
  }
  async function detail(id) {
    var dialog = $("detail-dialog");
    $("detail-content").innerHTML =
      '<div class="empty-state"><h2 id="detail-title">' +
      e(t("details")) +
      "…</h2></div>";
    if (!dialog.open) dialog.showModal();
    try {
      var r = await api("/api/v1/opportunities/" + encodeURIComponent(id));
      var eligibility = r.eligibility ? local(r.eligibility.text) : "";
      var sourceAttribution = r.source.attribution;
      var origin = r.original || {};
      var details =
        '<div class="detail-heading"><span class="kind-badge ' +
        e(r.kind) +
        '">' +
        icon(kindIcon(r.kind)) +
        e(t(r.kind)) +
        '</span><h2 id="detail-title">' +
        e(local(r.title)) +
        "</h2><p>" +
        e(local(r.summary)) +
        '</p></div><div class="detail-actions">' +
        link(r.url, t("original"), "primary-button") +
        (r.applyUrl ? link(r.applyUrl, t("apply"), "outline-button") : "") +
        '<button class="outline-button" data-save="' +
        e(r.id) +
        '">' +
        icon("bookmark") +
        e(t(state.saved.has(r.id) ? "unsave" : "save")) +
        '</button></div><div class="detail-meta"><div><small>' +
        e(t("verifiedDate")) +
        "</small><strong>" +
        e(dateLabel(r.source.lastVerified)) +
        "</strong></div><div><small>" +
        e(t("importedDate")) +
        "</small><strong>" +
        e(dateLabel(r.source.fetchedAt)) +
        "</strong></div><div><small>" +
        e(t("sourceType")) +
        "</small><strong>" +
        e(
          r.domain.namespace
            ? r.domain.namespace +
                " namespace · ownership not independently verified"
            : r.domain.directoryListed
              ? "Historical directory · needs verification"
              : "Publisher / unclassified source"
        ) +
        "</strong></div><div><small>Source status</small><strong>" +
        e(statusLabel(r)) +
        "</strong></div></div>";
      if (r.deadline)
        details +=
          '<section class="detail-section"><h3>' +
          (r.deadline.purpose === "consultation"
            ? "Consultation date"
            : "Recorded deadline") +
          "</h3><p>" +
          e(r.deadline.date ? dateLabel(r.deadline.date) : r.deadline.raw) +
          "</p></section>";
      if (local(r.benefits))
        details +=
          '<section class="detail-section"><h3>' +
          e(t("benefit")) +
          "</h3><p>" +
          e(local(r.benefits)) +
          "</p></section>";
      if (eligibility)
        details +=
          '<section class="detail-section"><h3>' +
          e(t("eligibility")) +
          "</h3><p>" +
          e(eligibility) +
          '</p><div class="evidence-box"><p>' +
          e(t("detailsNote")) +
          "</p></div></section>";
      if (r.links.length)
        details +=
          '<section class="detail-section"><h3>' +
          e(t("documents")) +
          "</h3><ul>" +
          r.links
            .map(function (item) {
              return "<li>" + link(item.url, item.label) + "</li>";
            })
            .join("") +
          "</ul></section>";
      details +=
        '<section class="detail-section"><h3>' +
        e(t("evidence")) +
        "</h3><p>" +
        e(
          r.evidence ||
            (origin.is_draft
              ? "This is an upstream draft. A date window does not establish current implementation."
              : "No independent verification is asserted. Scraping or importing a record does not establish accuracy or eligibility.")
        ) +
        '</p><div class="evidence-box"><p>' +
        link(r.source.recordUrl, "Upstream record / snapshot") +
        "<br />" +
        link(r.source.url, "Original cited source") +
        (r.source.revision
          ? "<br />Revision: <code>" + e(r.source.revision) + "</code>"
          : "") +
        "</p></div></section>";
      if (sourceAttribution)
        details +=
          '<div class="licence-note">' +
          link(sourceAttribution.url, sourceAttribution.name) +
          "<br />" +
          link(sourceAttribution.licenseUrl, r.source.license) +
          " · " +
          e(sourceAttribution.changes) +
          "</div>";
      else
        details +=
          '<div class="licence-note">Rights in the source content remain with its publisher. MIT covers the integration code, not scraped content.</div>';
      details +=
        '<details class="original-data"><summary>Original record, budgets & provenance (JSON)</summary><pre>' +
        e(JSON.stringify(r.original, null, 2)) +
        '</pre></details><div class="detail-actions"><button class="text-button" data-copy="' +
        e(location.origin + "/#record=" + encodeURIComponent(id)) +
        '">' +
        e(
          state.lang === "hi"
            ? "इस रिकॉर्ड का लिंक कॉपी करें"
            : "Copy link to this record"
        ) +
        " ↗</button></div>";
      $("detail-content").innerHTML = details;
    } catch (err) {
      $("detail-content").innerHTML =
        '<div class="empty-state"><h2 id="detail-title">' +
        e(t("error")) +
        "</h2><p>The record may have been removed from the latest snapshot. Close this panel and refresh the catalogue.</p></div>";
    }
  }
  function setView(view) {
    state.view = view;
    state.offset = 0;
    state.request += 1;
    document.querySelectorAll("[data-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === view);
      if (button.dataset.view === view)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    $("hero").hidden = view !== "explore";
    $("stats").hidden = view !== "explore";
    $("explore-view").hidden = ["explore", "saved"].indexOf(view) === -1;
    $("sources-view").hidden = view !== "sources";
    $("developers-view").hidden = view !== "developers";
    ["kind-tabs", "search-form", "category-chips"].forEach(function (id) {
      $(id).hidden = view === "saved";
    });
    if (view === "saved") $("advanced-filters").hidden = true;
    $("section-title").textContent = t(view === "saved" ? "saved" : "find");
    $("breadcrumb-current").textContent = t(view);
    $("sidebar").classList.remove("open");
    $("menu-toggle").setAttribute("aria-expanded", "false");
    if (view === "explore" || view === "saved") loadResults();
    if (view === "sources") renderSources();
    if (view === "developers") renderDevelopers();
  }
  async function renderSources() {
    $("sources-view").innerHTML =
      '<div class="page-intro"><div class="eyebrow">OPEN BY DESIGN</div><h1>' +
      e(t("sources")) +
      '</h1><p>Every record has a story. See where it came from, when it was imported, and what still needs verification.</p></div><div class="loading-card"></div>';
    try {
      var data = await api("/api/v1/sources");
      var imports = data.imports
        .map(function (s) {
          return (
            "<tr><td>" +
            e(s.label) +
            (s.origin ? "<br />" + link(s.origin, "Source") : "") +
            "</td><td>" +
            (s.count || 0) +
            '</td><td><span class="status-tag ' +
            e(s.status) +
            '">' +
            e(s.status) +
            "</span>" +
            (s.error ? '<p class="source-error">' + e(s.error) + "</p>" : "") +
            "</td><td>" +
            e(dateLabel(s.lastSuccess)) +
            "</td><td>" +
            e(s.license || "Source rights apply") +
            "</td></tr>"
          );
        })
        .join("");
      var scrapers = data.scrapers
        .map(function (s) {
          return (
            "<tr><td>" +
            e(s.domain) +
            "</td><td>" +
            e(s.jobs || "—") +
            "</td><td>" +
            e(s.papers || "—") +
            "</td><td>" +
            e(
              s.notes ||
                "Site-specific HTML parser. Check live output before publishing."
            ) +
            "</td></tr>"
          );
        })
        .join("");
      $("sources-view").innerHTML =
        '<div class="page-intro"><div class="eyebrow">OPEN BY DESIGN</div><h1>' +
        e(t("sources")) +
        "</h1><p>Source dates and import dates are different. A recent import never makes old evidence new. Imported snapshots stay available if the next sync fails.</p></div><h2>Import health</h2>" +
        (data.error ? '<div class="notice">' + e(data.error) + "</div>" : "") +
        (imports
          ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Collection</th><th>Records</th><th>Import status</th><th>Last complete import</th><th>Data licence</th></tr></thead><tbody>' +
            imports +
            "</tbody></table></div>"
          : '<div class="info-banner">No imports yet. Start with <code>npm run catalog:import -- --tracker-github</code>, or import your existing job JSON with <code>--jobs jobs.json</code>.</div>') +
        '<h2 class="section-spaced">Scraper coverage</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Portal</th><th>Jobs</th><th>Papers</th><th>What to know</th></tr></thead><tbody>' +
        scrapers +
        '</tbody></table></div><div class="directory-header"><h2>Domain discovery directory</h2><span class="subtle-link">' +
        (data.directory ? data.directory.count.toLocaleString("en-IN") : "0") +
        ' imported domains</span></div><div class="info-banner">' +
        link(
          "https://gist.github.com/captn3m0/4f3da8f07fe884e62bfab3ac85616936",
          "captn3m0’s historical directory"
        ) +
        ' is a discovery seed, not an official registry. Its author says it is no longer updated. Membership does not verify ownership, safety or permission to scrape. No explicit licence was found; review rights before redistributing it.</div><div class="search-box directory-search">' +
        icon("search") +
        '<input id="domain-search" type="search" placeholder="Find a domain, e.g. bihar" aria-label="Search historical domain directory" /></div><div id="directory-results"></div>';
      loadDirectory("");
      $("domain-search").addEventListener("input", function () {
        var q = this.value;
        clearTimeout(renderSources.timer);
        renderSources.timer = setTimeout(function () {
          loadDirectory(q);
        }, 250);
      });
    } catch (err) {
      $("sources-view").innerHTML = empty("error", "footerNote", "retry");
    }
  }
  async function loadDirectory(q) {
    try {
      var data = await api(
        "/api/v1/domains?limit=100&q=" + encodeURIComponent(q)
      );
      if (!$("directory-results")) return;
      $("directory-results").innerHTML = data.results.length
        ? '<p class="directory-note">' +
          data.total +
          " matches. Showing the first " +
          data.results.length +
          '.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Hostname</th><th>Namespace</th><th>Ownership</th></tr></thead><tbody>' +
          data.results
            .map(function (d) {
              return (
                "<tr><td>" +
                e(d.hostname) +
                "</td><td>" +
                e(d.namespace || "Other") +
                "</td><td>Not independently verified</td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<p class="directory-note">' +
          (data.total
            ? "No matching domains."
            : "No matching imported domains. Use --domains path/to/01-domains.md or explicitly opt in with --fetch-domains. The importer does not crawl listed sites.") +
          "</p>";
    } catch (err) {
      if ($("directory-results"))
        $("directory-results").textContent =
          "Could not load the directory. Please try again.";
    }
  }
  function codeBlock(value) {
    return (
      '<div class="code-block"><button class="copy-button" data-copy="' +
      e(value) +
      '">' +
      e(t("copy")) +
      "</button><code>" +
      e(value) +
      "</code></div>"
    );
  }
  function renderDevelopers() {
    var curl =
      'curl "' +
      location.origin +
      '/api/v1/opportunities?kind=scheme&region=bihar&limit=10"';
    $("developers-view").innerHTML =
      '<div class="page-intro"><div class="eyebrow">BUILD SOMETHING USEFUL</div><h1>Public data. Your next project.</h1><p>A small, read-only API for your job board, community bot, research tool or learning platform. No scraping on page requests. No keys for reading this catalogue.</p></div><h2>Start with one request</h2>' +
      codeBlock(curl) +
      [
        ["/api/v1", "Discovery & counts"],
        ["/api/v1/opportunities?limit=10", "Search & filter"],
        ["/api/v1/sources", "Provenance & health"],
        ["/api/v1/changes", "Recent import changes"],
        ["/api/v1/export?format=json", "JSON export"],
        ["/api/v1/export?format=csv", "Spreadsheet export"],
        ["/api/v1/export?format=rss", "RSS feed"],
        ["/api/v1/export?format=ics", "Deadline calendar"],
      ]
        .map(function (entry) {
          return (
            '<div class="endpoint"><span class="endpoint-method">GET</span><code>' +
            e(entry[0]) +
            '</code><a href="' +
            e(entry[0]) +
            '" target="_blank" rel="noopener noreferrer" aria-label="' +
            e(entry[1]) +
            '">↗</a></div>'
          );
        })
        .join("") +
      '<div class="info-banner">Filters: <code>q, kind, category, region, source, freshness, status, persona, age, income, namespace</code>. Pagination: <code>limit</code> (1–100) and <code>offset</code>. Exports support the same filters, up to 1,000 records. Unknown eligibility stays unknown. There are no public write, import or crawl endpoints.</div><h2 class="section-spaced">Bring your sources together</h2>' +
      codeBlock(
        "# Import the pinned tracker catalogue\nnpm run catalog:import -- --tracker-github\n\n# Add the output from our existing job scraper\nnode run-scrapper.js -d sarkariresult.com -o jobs.json --max-pages 1 --max-jobs 10\nnpm run catalog:import -- --jobs jobs.json\n\n# Read a local domain directory — no website crawling\nnpm run catalog:import -- --domains 01-domains.md\n\n# Serve your catalogue\nnpm start"
      ) +
      '<div class="developer-grid"><article class="developer-card"><h3>Use the Node API</h3><p>The package now has a side-effect-free entry point. Use <code>require("sarkari-scraper").catalogue</code> for importers, normalization, search and the HTTP server. Your existing CLI commands still work.</p><a href="https://github.com/bihar24/sarkari-scraper" target="_blank" rel="noopener noreferrer">Source & documentation ↗</a></article><article class="developer-card"><h3>Respect the data licence</h3><p>Original integration code is MIT. Tracker schemes and policies are CC BY-SA 4.0, with attribution, evidence and original fields preserved in exports. Scraped content keeps its publisher’s rights.</p><a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">Read the data licence ↗</a></article></div>';
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.view) setView(button.dataset.view);
    else if (button.hasAttribute("data-kind")) {
      state.kind = button.dataset.kind;
      state.offset = 0;
      if (state.view !== "explore") setView("explore");
      else loadResults();
      renderTabs();
    } else if (button.hasAttribute("data-category")) {
      state.category = button.dataset.category;
      state.offset = 0;
      renderTabs();
      loadResults();
    } else if (button.dataset.save) save(button.dataset.save);
    else if (button.dataset.detail) detail(button.dataset.detail);
    else if (button.dataset.page) {
      state.offset = Math.max(
        0,
        state.offset + Number(button.dataset.page) * state.limit
      );
      loadResults();
    } else if (button.dataset.action === "clear") resetFilters();
    else if (button.dataset.action === "explore") setView("explore");
    else if (button.dataset.action === "retry") {
      if (state.meta) setView(state.view);
      else initialize();
    } else if (button.dataset.copy) {
      if (!navigator.clipboard) {
        toast("Clipboard unavailable. Select and copy the displayed command.");
        return;
      }
      navigator.clipboard
        .writeText(button.dataset.copy)
        .then(function () {
          toast(t("copied"));
        })
        .catch(function () {
          toast(
            "Clipboard unavailable. Select and copy the displayed command."
          );
        });
    }
  });
  $("language-toggle").addEventListener("click", function () {
    state.lang = state.lang === "en" ? "hi" : "en";
    writeLocal("sarkari-language", state.lang);
    updateLanguage();
    setView(state.view);
  });
  $("filter-toggle").addEventListener("click", function () {
    var open = $("advanced-filters").hidden;
    $("advanced-filters").hidden = !open;
    this.setAttribute("aria-expanded", String(open));
  });
  $("clear-filters").addEventListener("click", resetFilters);
  $("search-form").addEventListener("submit", function (event) {
    event.preventDefault();
    clearTimeout(searchTimer);
    state.q = $("search").value;
    state.offset = 0;
    loadResults();
  });
  var searchTimer;
  $("search").addEventListener("input", function () {
    clearTimeout(searchTimer);
    var q = this.value;
    searchTimer = setTimeout(function () {
      state.q = q;
      state.offset = 0;
      loadResults();
    }, 250);
  });
  [
    ["region-filter", "region"],
    ["persona-filter", "persona"],
    ["namespace-filter", "namespace"],
    ["freshness-filter", "freshness"],
  ].forEach(function (pair) {
    $(pair[0]).addEventListener("change", function () {
      state[pair[1]] = this.value;
      state.offset = 0;
      $("filter-dot").hidden =
        !state.persona && !state.namespace && !state.freshness;
      loadResults();
    });
  });
  $("close-detail").addEventListener("click", function () {
    $("detail-dialog").close();
  });
  $("detail-dialog").addEventListener("click", function (event) {
    if (event.target === this) this.close();
  });
  $("menu-toggle").addEventListener("click", function () {
    var open = $("sidebar").classList.toggle("open");
    this.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", function (event) {
    if (
      event.key === "/" &&
      !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
      !$("detail-dialog").open &&
      state.view === "explore"
    ) {
      event.preventDefault();
      $("search").focus();
    }
    if (event.key === "Escape") {
      $("sidebar").classList.remove("open");
      $("menu-toggle").setAttribute("aria-expanded", "false");
    }
  });
  async function initialize() {
    paintIcons();
    updateLanguage();
    try {
      state.meta = await api("/api/v1");
      renderMeta();
      setView(state.view);
      if (location.hash.startsWith("#record=")) {
        try {
          detail(decodeURIComponent(location.hash.slice(8)));
        } catch (err) {
          toast("Invalid record link.");
        }
      }
    } catch (err) {
      $("results").innerHTML = empty("error", "footerNote", "retry");
      $("results").setAttribute("aria-busy", "false");
      $("results-count").textContent = t("error");
      $("snapshot-state").textContent = "Catalogue unavailable";
    }
  }
  initialize();
})();
