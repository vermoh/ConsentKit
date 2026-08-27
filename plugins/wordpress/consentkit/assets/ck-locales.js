/* ConsentKit locale pack (Agent D). Self-contained IIFE, zero dependencies.
   Loaded between ck-core.js and ck-ui.js; ck-ui.js merges builtin(en,ru) <- window.__ckLocales.

   Locales (32): bg cs da de el es et fi fr ga hr hu it lt lv mt nl pl pt ro sk sl sv
                 (23 official EU languages; en and ru ship builtin in ck-ui.js)
                 + uk tr no nb is sr ca sq mk

   Key set mirrors the builtin en dictionary of ck-ui.js exactly:
   19 flat strings + cat.{necessary,functional,analytics,marketing}.{title,desc}.

   NOTE: these translations are drafts produced for the prototype. They MUST be reviewed
   by native speakers before production use — legal wording (refusal, "always on") is the
   part most likely to need a lawyer's eye per jurisdiction. */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;  // SSR / Node: no-op

  var L = {};

  L.bg = {
    bannerTitle: 'Използваме бисквитки',
    bannerText: 'Необходимите бисквитки поддържат сайта работещ. Всичко останало — анализи, маркетинг, допълнителни удобства — се включва само с ваше съгласие. Можете да промените решението си по всяко време.',
    more: 'Научете повече',
    acceptAll: 'Приемам всички',
    rejectAll: 'Отхвърлям всички',
    customize: 'Настройки',
    bannerLabel: 'Съгласие за бисквитки',
    panelTitle: 'Настройки на бисквитките',
    panelIntro: 'Изберете кои бисквитки разрешавате. Нищо по избор не е включено, докато не го включите сами.',
    save: 'Запази избора',
    close: 'Затвори',
    alwaysOn: 'винаги активни',
    cookiesIn: 'Бисквитки в тази група',
    noCookies: 'За тази група не са обявени бисквитки.',
    colName: 'Име',
    colVendor: 'Доставчик',
    colPurpose: 'Цел',
    colExpiry: 'Изтича',
    floating: 'Настройки на бисквитките',
    cat: {
      necessary: { title: 'Необходими', desc: 'Нужни са, за да работи сайтът — вход, сигурност, запомняне на съгласието ви. Не могат да се изключат.' },
      functional: { title: 'Функционални', desc: 'Запомнят предпочитанията ви, например език или чат, за да не ги задавате отново.' },
      analytics: { title: 'Анализи', desc: 'Помагат ни да видим кои страници се използват, за да поправим неудобното. Само числа, без имена.' },
      marketing: { title: 'Маркетинг', desc: 'Позволяват да ви показваме реклами в други сайтове и да преценим дали са били от полза.' }
    }
  };

  L.cs = {
    bannerTitle: 'Používáme cookies',
    bannerText: 'Nezbytné cookies udržují web v chodu. Vše ostatní — analytika, marketing, další vylepšení — se zapne jen s vaším souhlasem. Rozhodnutí můžete kdykoli změnit.',
    more: 'Více informací',
    acceptAll: 'Přijmout vše',
    rejectAll: 'Odmítnout vše',
    customize: 'Nastavit',
    bannerLabel: 'Souhlas s cookies',
    panelTitle: 'Nastavení cookies',
    panelIntro: 'Vyberte, které cookies povolíte. Nic volitelného není zapnuté, dokud to sami nezapnete.',
    save: 'Uložit volbu',
    close: 'Zavřít',
    alwaysOn: 'vždy aktivní',
    cookiesIn: 'Cookies v této skupině',
    noCookies: 'Pro tuto skupinu nejsou uvedeny žádné cookies.',
    colName: 'Název',
    colVendor: 'Poskytovatel',
    colPurpose: 'Účel',
    colExpiry: 'Platnost',
    floating: 'Nastavení cookies',
    cat: {
      necessary: { title: 'Nezbytné', desc: 'Bez nich web nefunguje — přihlášení, bezpečnost, uložení vašeho souhlasu. Nelze je vypnout.' },
      functional: { title: 'Funkční', desc: 'Pamatují si vaše předvolby, třeba jazyk nebo chat, abyste je nenastavovali znovu.' },
      analytics: { title: 'Analytické', desc: 'Ukazují nám, které stránky lidé používají, abychom opravili to nepřehledné. Jen čísla, žádná jména.' },
      marketing: { title: 'Marketingové', desc: 'Umožňují nám zobrazovat vám reklamy na jiných webech a měřit, zda byly k něčemu.' }
    }
  };

  L.da = {
    bannerTitle: 'Vi bruger cookies',
    bannerText: 'Nødvendige cookies holder siden i gang. Alt andet — statistik, markedsføring, ekstra funktioner — sættes kun til, hvis du tillader det. Du kan altid ombestemme dig.',
    more: 'Læs mere',
    acceptAll: 'Accepter alle',
    rejectAll: 'Afvis alle',
    customize: 'Tilpas',
    bannerLabel: 'Cookiesamtykke',
    panelTitle: 'Cookieindstillinger',
    panelIntro: 'Vælg, hvilke cookies du tillader. Intet valgfrit er slået til, før du selv slår det til.',
    save: 'Gem valg',
    close: 'Luk',
    alwaysOn: 'altid aktive',
    cookiesIn: 'Cookies i denne gruppe',
    noCookies: 'Der er ikke angivet cookies for denne gruppe.',
    colName: 'Navn',
    colVendor: 'Udbyder',
    colPurpose: 'Formål',
    colExpiry: 'Udløber',
    floating: 'Cookieindstillinger',
    cat: {
      necessary: { title: 'Nødvendige', desc: 'Nødvendige for at siden virker — login, sikkerhed, hukommelse om dit samtykke. De kan ikke slås fra.' },
      functional: { title: 'Funktionelle', desc: 'Husker dine indstillinger, fx sprog eller chat, så du ikke skal vælge dem igen.' },
      analytics: { title: 'Statistik', desc: 'Viser os, hvilke sider folk bruger, så vi kan rette det, der forvirrer. Kun tal, ingen navne.' },
      marketing: { title: 'Markedsføring', desc: 'Giver os mulighed for at vise dig annoncer på andre sider og måle, om de virkede.' }
    }
  };

  L.de = {
    bannerTitle: 'Wir verwenden Cookies',
    bannerText: 'Notwendige Cookies halten die Website am Laufen. Alles Weitere — Statistik, Marketing, zusätzliche Funktionen — läuft nur, wenn Sie es erlauben. Sie können Ihre Entscheidung jederzeit ändern.',
    more: 'Mehr erfahren',
    acceptAll: 'Alle akzeptieren',
    rejectAll: 'Alle ablehnen',
    customize: 'Einstellen',
    bannerLabel: 'Cookie-Einwilligung',
    panelTitle: 'Cookie-Einstellungen',
    panelIntro: 'Wählen Sie, welche Cookies Sie erlauben. Nichts Optionales ist aktiv, bis Sie es einschalten.',
    save: 'Auswahl speichern',
    close: 'Schließen',
    alwaysOn: 'immer aktiv',
    cookiesIn: 'Cookies in dieser Gruppe',
    noCookies: 'Für diese Gruppe sind keine Cookies angegeben.',
    colName: 'Name',
    colVendor: 'Anbieter',
    colPurpose: 'Zweck',
    colExpiry: 'Laufzeit',
    floating: 'Cookie-Einstellungen',
    cat: {
      necessary: { title: 'Notwendig', desc: 'Nötig, damit die Website funktioniert — Anmeldung, Sicherheit, Speichern Ihrer Einwilligung. Sie lassen sich nicht abschalten.' },
      functional: { title: 'Funktional', desc: 'Merken sich Ihre Einstellungen, etwa Sprache oder Chat, damit Sie sie nicht erneut wählen müssen.' },
      analytics: { title: 'Statistik', desc: 'Zeigen uns, welche Seiten genutzt werden, damit wir Unklares verbessern. Nur Zahlen, keine Namen.' },
      marketing: { title: 'Marketing', desc: 'Erlauben uns, Ihnen Werbung auf anderen Seiten zu zeigen und zu messen, ob sie etwas gebracht hat.' }
    }
  };

  L.el = {
    bannerTitle: 'Χρησιμοποιούμε cookies',
    bannerText: 'Τα απαραίτητα cookies κρατούν τον ιστότοπο σε λειτουργία. Όλα τα υπόλοιπα — στατιστικά, μάρκετινγκ, πρόσθετες ευκολίες — ενεργοποιούνται μόνο με τη συγκατάθεσή σας. Μπορείτε να αλλάξετε γνώμη ανά πάσα στιγμή.',
    more: 'Μάθετε περισσότερα',
    acceptAll: 'Αποδοχή όλων',
    rejectAll: 'Απόρριψη όλων',
    customize: 'Ρυθμίσεις',
    bannerLabel: 'Συγκατάθεση για cookies',
    panelTitle: 'Ρυθμίσεις cookies',
    panelIntro: 'Επιλέξτε ποια cookies επιτρέπετε. Τίποτα προαιρετικό δεν είναι ενεργό μέχρι να το ενεργοποιήσετε εσείς.',
    save: 'Αποθήκευση επιλογών',
    close: 'Κλείσιμο',
    alwaysOn: 'πάντα ενεργά',
    cookiesIn: 'Cookies αυτής της ομάδας',
    noCookies: 'Δεν έχουν δηλωθεί cookies για αυτήν την ομάδα.',
    colName: 'Όνομα',
    colVendor: 'Πάροχος',
    colPurpose: 'Σκοπός',
    colExpiry: 'Λήξη',
    floating: 'Ρυθμίσεις cookies',
    cat: {
      necessary: { title: 'Απαραίτητα', desc: 'Χρειάζονται για να λειτουργεί ο ιστότοπος — σύνδεση, ασφάλεια, διατήρηση της επιλογής σας. Δεν απενεργοποιούνται.' },
      functional: { title: 'Λειτουργικά', desc: 'Θυμούνται τις προτιμήσεις σας, όπως γλώσσα ή συνομιλία, ώστε να μην τις ορίζετε ξανά.' },
      analytics: { title: 'Στατιστικά', desc: 'Μας δείχνουν ποιες σελίδες χρησιμοποιούνται, για να διορθώσουμε ό,τι μπερδεύει. Μόνο αριθμοί, χωρίς ονόματα.' },
      marketing: { title: 'Μάρκετινγκ', desc: 'Μας επιτρέπουν να σας δείχνουμε διαφημίσεις σε άλλους ιστότοπους και να μετράμε αν ήταν χρήσιμες.' }
    }
  };

  L.es = {
    bannerTitle: 'Usamos cookies',
    bannerText: 'Las cookies necesarias mantienen el sitio en funcionamiento. Todo lo demás — analítica, marketing, funciones adicionales — solo se activa si usted lo permite. Puede cambiar de opinión cuando quiera.',
    more: 'Más información',
    acceptAll: 'Aceptar todo',
    rejectAll: 'Rechazar todo',
    customize: 'Personalizar',
    bannerLabel: 'Consentimiento de cookies',
    panelTitle: 'Configuración de cookies',
    panelIntro: 'Elija qué cookies permite. Nada opcional está activo hasta que usted lo active.',
    save: 'Guardar selección',
    close: 'Cerrar',
    alwaysOn: 'siempre activas',
    cookiesIn: 'Cookies de este grupo',
    noCookies: 'No se han declarado cookies para este grupo.',
    colName: 'Nombre',
    colVendor: 'Proveedor',
    colPurpose: 'Finalidad',
    colExpiry: 'Caduca',
    floating: 'Configuración de cookies',
    cat: {
      necessary: { title: 'Necesarias', desc: 'Imprescindibles para que el sitio funcione: inicio de sesión, seguridad y memoria de su consentimiento. No se pueden desactivar.' },
      functional: { title: 'Funcionales', desc: 'Recuerdan sus preferencias, como el idioma o el chat, para que no tenga que configurarlas de nuevo.' },
      analytics: { title: 'Analítica', desc: 'Nos muestran qué páginas se usan para corregir lo que resulta confuso. Solo cifras, sin nombres.' },
      marketing: { title: 'Marketing', desc: 'Nos permiten mostrarle anuncios en otros sitios y medir si han servido de algo.' }
    }
  };

  L.et = {
    bannerTitle: 'Kasutame küpsiseid',
    bannerText: 'Vajalikud küpsised hoiavad saidi töös. Kõik muu — statistika, turundus, lisamugavused — lülitub sisse ainult teie nõusolekul. Võite oma otsust igal ajal muuta.',
    more: 'Loe lähemalt',
    acceptAll: 'Nõustu kõigiga',
    rejectAll: 'Keeldu kõigist',
    customize: 'Seadista',
    bannerLabel: 'Küpsiste nõusolek',
    panelTitle: 'Küpsiste seaded',
    panelIntro: 'Valige, milliseid küpsiseid lubate. Miski valikuline ei ole sees, enne kui te selle ise sisse lülitate.',
    save: 'Salvesta valik',
    close: 'Sulge',
    alwaysOn: 'alati aktiivsed',
    cookiesIn: 'Selle rühma küpsised',
    noCookies: 'Selle rühma kohta ei ole küpsiseid deklareeritud.',
    colName: 'Nimi',
    colVendor: 'Pakkuja',
    colPurpose: 'Eesmärk',
    colExpiry: 'Kehtivus',
    floating: 'Küpsiste seaded',
    cat: {
      necessary: { title: 'Vajalikud', desc: 'Vajalikud saidi tööks — sisselogimine, turvalisus, teie nõusoleku meelespidamine. Neid ei saa välja lülitada.' },
      functional: { title: 'Funktsionaalsed', desc: 'Jätavad meelde teie eelistused, näiteks keele või vestluse, et te ei peaks neid uuesti valima.' },
      analytics: { title: 'Statistika', desc: 'Näitavad meile, milliseid lehti kasutatakse, et saaksime segadust tekitava korda teha. Ainult numbrid, ilma nimedeta.' },
      marketing: { title: 'Turundus', desc: 'Võimaldavad näidata teile reklaame teistel saitidel ja mõõta, kas neist oli kasu.' }
    }
  };

  L.fi = {
    bannerTitle: 'Käytämme evästeitä',
    bannerText: 'Välttämättömät evästeet pitävät sivuston toiminnassa. Kaikki muu — tilastot, markkinointi, lisämukavuudet — otetaan käyttöön vain suostumuksellanne. Voitte muuttaa valintaanne milloin tahansa.',
    more: 'Lue lisää',
    acceptAll: 'Hyväksy kaikki',
    rejectAll: 'Hylkää kaikki',
    customize: 'Muokkaa',
    bannerLabel: 'Evästesuostumus',
    panelTitle: 'Evästeasetukset',
    panelIntro: 'Valitkaa, mitkä evästeet sallitte. Mikään valinnainen ei ole päällä, ennen kuin otatte sen itse käyttöön.',
    save: 'Tallenna valinta',
    close: 'Sulje',
    alwaysOn: 'aina käytössä',
    cookiesIn: 'Tämän ryhmän evästeet',
    noCookies: 'Tälle ryhmälle ei ole ilmoitettu evästeitä.',
    colName: 'Nimi',
    colVendor: 'Toimittaja',
    colPurpose: 'Tarkoitus',
    colExpiry: 'Voimassaolo',
    floating: 'Evästeasetukset',
    cat: {
      necessary: { title: 'Välttämättömät', desc: 'Tarvitaan sivuston toimintaan: kirjautuminen, turvallisuus ja suostumuksenne muistaminen. Näitä ei voi poistaa käytöstä.' },
      functional: { title: 'Toiminnalliset', desc: 'Muistavat asetuksenne, kuten kielen tai chatin, jottei niitä tarvitse valita uudelleen.' },
      analytics: { title: 'Tilastot', desc: 'Kertovat meille, mitä sivuja käytetään, jotta voimme korjata sekavat kohdat. Vain lukuja, ei nimiä.' },
      marketing: { title: 'Markkinointi', desc: 'Antavat meidän näyttää teille mainoksia muilla sivustoilla ja mitata, oliko niistä hyötyä.' }
    }
  };

  L.fr = {
    bannerTitle: 'Nous utilisons des cookies',
    bannerText: 'Les cookies nécessaires font fonctionner le site. Tout le reste — mesure d’audience, marketing, options de confort — ne s’active que si vous l’autorisez. Vous pouvez changer d’avis à tout moment.',
    more: 'En savoir plus',
    acceptAll: 'Tout accepter',
    rejectAll: 'Tout refuser',
    customize: 'Personnaliser',
    bannerLabel: 'Consentement aux cookies',
    panelTitle: 'Paramètres des cookies',
    panelIntro: 'Choisissez les cookies que vous autorisez. Rien d’optionnel n’est activé tant que vous ne l’activez pas.',
    save: 'Enregistrer',
    close: 'Fermer',
    alwaysOn: 'toujours actifs',
    cookiesIn: 'Cookies de ce groupe',
    noCookies: 'Aucun cookie déclaré pour ce groupe.',
    colName: 'Nom',
    colVendor: 'Fournisseur',
    colPurpose: 'Finalité',
    colExpiry: 'Expiration',
    floating: 'Paramètres des cookies',
    cat: {
      necessary: { title: 'Nécessaires', desc: 'Indispensables au fonctionnement du site : connexion, sécurité, mémorisation de votre choix. Ils ne peuvent pas être désactivés.' },
      functional: { title: 'Fonctionnels', desc: 'Retiennent vos préférences, par exemple la langue ou le chat, pour ne pas avoir à les régler de nouveau.' },
      analytics: { title: 'Mesure d’audience', desc: 'Nous montrent quelles pages sont consultées, afin de corriger ce qui prête à confusion. Des chiffres seulement, aucun nom.' },
      marketing: { title: 'Marketing', desc: 'Nous permettent de vous montrer des publicités sur d’autres sites et de mesurer leur utilité.' }
    }
  };

  L.ga = {
    bannerTitle: 'Úsáidimid fianáin',
    bannerText: 'Coinníonn fianáin riachtanacha an suíomh ag obair. Gach rud eile — anailísíocht, margaíocht, áiseanna breise — ní ritheann sé ach le do chead. Is féidir leat d’intinn a athrú am ar bith.',
    more: 'Tuilleadh eolais',
    acceptAll: 'Glac le gach ceann',
    rejectAll: 'Diúltaigh do gach ceann',
    customize: 'Saincheap',
    bannerLabel: 'Toiliú fianán',
    panelTitle: 'Socruithe fianán',
    panelIntro: 'Roghnaigh na fianáin a cheadaíonn tú. Níl aon rud roghnach ar siúl go dtí go gcuireann tú féin ar siúl é.',
    save: 'Sábháil an rogha',
    close: 'Dún',
    alwaysOn: 'gníomhach i gcónaí',
    cookiesIn: 'Fianáin sa ghrúpa seo',
    noCookies: 'Níl aon fhianán dearbhaithe don ghrúpa seo.',
    colName: 'Ainm',
    colVendor: 'Soláthraí',
    colPurpose: 'Cuspóir',
    colExpiry: 'Éagann',
    floating: 'Socruithe fianán',
    cat: {
      necessary: { title: 'Riachtanach', desc: 'Ag teastáil chun an suíomh a oibriú — logáil isteach, slándáil, do thoiliú a choinneáil. Ní féidir iad a mhúchadh.' },
      functional: { title: 'Feidhmiúil', desc: 'Coinníonn siad do roghanna, mar shampla an teanga nó an comhrá, ionas nach gá duit iad a shocrú arís.' },
      analytics: { title: 'Anailísíocht', desc: 'Taispeánann siad dúinn na leathanaigh a úsáidtear, chun an rud atá mearbhallach a cheartú. Uimhreacha amháin, gan ainmneacha.' },
      marketing: { title: 'Margaíocht', desc: 'Ligeann siad dúinn fógraí a thaispeáint duit ar shuímh eile agus a thomhas an raibh aon mhaith leo.' }
    }
  };

  L.hr = {
    bannerTitle: 'Koristimo kolačiće',
    bannerText: 'Nužni kolačići održavaju stranicu u radu. Sve ostalo — analitika, marketing, dodatne pogodnosti — uključuje se samo uz vaš pristanak. Odluku možete promijeniti u svakom trenutku.',
    more: 'Saznajte više',
    acceptAll: 'Prihvati sve',
    rejectAll: 'Odbij sve',
    customize: 'Postavke',
    bannerLabel: 'Privola za kolačiće',
    panelTitle: 'Postavke kolačića',
    panelIntro: 'Odaberite koje kolačiće dopuštate. Ništa neobavezno nije uključeno dok to sami ne uključite.',
    save: 'Spremi odabir',
    close: 'Zatvori',
    alwaysOn: 'uvijek aktivni',
    cookiesIn: 'Kolačići u ovoj skupini',
    noCookies: 'Za ovu skupinu nisu navedeni kolačići.',
    colName: 'Naziv',
    colVendor: 'Pružatelj',
    colPurpose: 'Svrha',
    colExpiry: 'Istječe',
    floating: 'Postavke kolačića',
    cat: {
      necessary: { title: 'Nužni', desc: 'Potrebni su za rad stranice — prijava, sigurnost, pamćenje vaše privole. Ne mogu se isključiti.' },
      functional: { title: 'Funkcionalni', desc: 'Pamte vaše postavke, primjerice jezik ili chat, da ih ne morate ponovno birati.' },
      analytics: { title: 'Analitika', desc: 'Pokazuju nam koje se stranice koriste kako bismo ispravili ono što zbunjuje. Samo brojke, bez imena.' },
      marketing: { title: 'Marketing', desc: 'Omogućuju nam da vam prikazujemo oglase na drugim stranicama i izmjerimo jesu li bili od koristi.' }
    }
  };

  L.hu = {
    bannerTitle: 'Sütiket használunk',
    bannerText: 'A szükséges sütik tartják működésben az oldalt. Minden más — statisztika, marketing, kényelmi funkciók — csak az Ön hozzájárulásával indul el. Döntését bármikor módosíthatja.',
    more: 'További információ',
    acceptAll: 'Mind elfogadása',
    rejectAll: 'Mind elutasítása',
    customize: 'Beállítás',
    bannerLabel: 'Süti-hozzájárulás',
    panelTitle: 'Sütibeállítások',
    panelIntro: 'Válassza ki, mely sütiket engedélyezi. Semmi választható nincs bekapcsolva, amíg Ön be nem kapcsolja.',
    save: 'Választás mentése',
    close: 'Bezárás',
    alwaysOn: 'mindig aktív',
    cookiesIn: 'A csoport sütijei',
    noCookies: 'Ehhez a csoporthoz nincs süti megadva.',
    colName: 'Név',
    colVendor: 'Szolgáltató',
    colPurpose: 'Cél',
    colExpiry: 'Lejárat',
    floating: 'Sütibeállítások',
    cat: {
      necessary: { title: 'Szükséges', desc: 'Az oldal működéséhez kellenek: belépés, biztonság, a hozzájárulása megjegyzése. Nem kapcsolhatók ki.' },
      functional: { title: 'Funkcionális', desc: 'Megjegyzik a beállításait, például a nyelvet vagy a chatet, hogy ne kelljen újra megadnia őket.' },
      analytics: { title: 'Statisztika', desc: 'Megmutatják, mely oldalakat használják, hogy javíthassuk a zavarosat. Csak számok, nevek nélkül.' },
      marketing: { title: 'Marketing', desc: 'Lehetővé teszik, hogy hirdetéseket mutassunk Önnek más oldalakon, és mérjük, volt-e belőlük haszon.' }
    }
  };

  L.it = {
    bannerTitle: 'Utilizziamo i cookie',
    bannerText: 'I cookie necessari fanno funzionare il sito. Tutto il resto — statistiche, marketing, funzioni aggiuntive — si attiva solo se lo consente. Può cambiare idea in qualsiasi momento.',
    more: 'Scopri di più',
    acceptAll: 'Accetta tutto',
    rejectAll: 'Rifiuta tutto',
    customize: 'Personalizza',
    bannerLabel: 'Consenso ai cookie',
    panelTitle: 'Impostazioni dei cookie',
    panelIntro: 'Scelga quali cookie autorizzare. Nulla di facoltativo è attivo finché non lo attiva Lei.',
    save: 'Salva le scelte',
    close: 'Chiudi',
    alwaysOn: 'sempre attivi',
    cookiesIn: 'Cookie di questo gruppo',
    noCookies: 'Nessun cookie dichiarato per questo gruppo.',
    colName: 'Nome',
    colVendor: 'Fornitore',
    colPurpose: 'Finalità',
    colExpiry: 'Scadenza',
    floating: 'Impostazioni dei cookie',
    cat: {
      necessary: { title: 'Necessari', desc: 'Servono al funzionamento del sito: accesso, sicurezza, memoria del suo consenso. Non possono essere disattivati.' },
      functional: { title: 'Funzionali', desc: 'Ricordano le sue preferenze, come la lingua o la chat, così non deve impostarle di nuovo.' },
      analytics: { title: 'Statistiche', desc: 'Ci mostrano quali pagine vengono usate, per correggere ciò che risulta poco chiaro. Solo numeri, nessun nome.' },
      marketing: { title: 'Marketing', desc: 'Ci permettono di mostrarle annunci su altri siti e di misurare se sono serviti a qualcosa.' }
    }
  };

  L.lt = {
    bannerTitle: 'Naudojame slapukus',
    bannerText: 'Būtini slapukai palaiko svetainės veikimą. Visa kita — analitika, rinkodara, papildomi patogumai — įsijungia tik jums sutikus. Sprendimą galite pakeisti bet kada.',
    more: 'Sužinoti daugiau',
    acceptAll: 'Priimti visus',
    rejectAll: 'Atmesti visus',
    customize: 'Tinkinti',
    bannerLabel: 'Sutikimas dėl slapukų',
    panelTitle: 'Slapukų nustatymai',
    panelIntro: 'Pasirinkite, kuriuos slapukus leidžiate. Nieko pasirenkamo nėra įjungta, kol patys neįjungiate.',
    save: 'Įrašyti pasirinkimą',
    close: 'Uždaryti',
    alwaysOn: 'visada aktyvūs',
    cookiesIn: 'Šios grupės slapukai',
    noCookies: 'Šiai grupei slapukų nenurodyta.',
    colName: 'Pavadinimas',
    colVendor: 'Teikėjas',
    colPurpose: 'Paskirtis',
    colExpiry: 'Galiojimas',
    floating: 'Slapukų nustatymai',
    cat: {
      necessary: { title: 'Būtini', desc: 'Reikalingi, kad svetainė veiktų: prisijungimas, saugumas, jūsų sutikimo įsiminimas. Jų išjungti negalima.' },
      functional: { title: 'Funkciniai', desc: 'Įsimena jūsų nustatymus, pavyzdžiui, kalbą ar pokalbius, kad jų nereikėtų nurodyti iš naujo.' },
      analytics: { title: 'Analitika', desc: 'Rodo mums, kurie puslapiai naudojami, kad pataisytume tai, kas painu. Tik skaičiai, be vardų.' },
      marketing: { title: 'Rinkodara', desc: 'Leidžia rodyti jums reklamą kitose svetainėse ir įvertinti, ar iš jos buvo naudos.' }
    }
  };

  L.lv = {
    bannerTitle: 'Mēs izmantojam sīkdatnes',
    bannerText: 'Nepieciešamās sīkdatnes nodrošina vietnes darbību. Viss pārējais — analītika, mārketings, papildu ērtības — darbojas tikai ar jūsu piekrišanu. Savu izvēli varat mainīt jebkurā brīdī.',
    more: 'Uzzināt vairāk',
    acceptAll: 'Piekrist visām',
    rejectAll: 'Noraidīt visas',
    customize: 'Pielāgot',
    bannerLabel: 'Piekrišana sīkdatnēm',
    panelTitle: 'Sīkdatņu iestatījumi',
    panelIntro: 'Izvēlieties, kuras sīkdatnes atļaujat. Nekas neobligāts nav ieslēgts, kamēr to neieslēdzat pats.',
    save: 'Saglabāt izvēli',
    close: 'Aizvērt',
    alwaysOn: 'vienmēr aktīvas',
    cookiesIn: 'Šīs grupas sīkdatnes',
    noCookies: 'Šai grupai sīkdatnes nav norādītas.',
    colName: 'Nosaukums',
    colVendor: 'Sniedzējs',
    colPurpose: 'Nolūks',
    colExpiry: 'Derīgums',
    floating: 'Sīkdatņu iestatījumi',
    cat: {
      necessary: { title: 'Nepieciešamās', desc: 'Vajadzīgas vietnes darbībai — pieteikšanās, drošība, jūsu piekrišanas saglabāšana. Tās nevar izslēgt.' },
      functional: { title: 'Funkcionālās', desc: 'Atceras jūsu iestatījumus, piemēram, valodu vai tērzēšanu, lai tie nebūtu jānorāda atkārtoti.' },
      analytics: { title: 'Analītika', desc: 'Rāda mums, kuras lapas tiek lietotas, lai varam labot neskaidro. Tikai skaitļi, bez vārdiem.' },
      marketing: { title: 'Mārketings', desc: 'Ļauj rādīt jums reklāmas citās vietnēs un novērtēt, vai no tām bija labums.' }
    }
  };

  L.mt = {
    bannerTitle: 'Nużaw il-cookies',
    bannerText: 'Il-cookies meħtieġa jżommu s-sit jaħdem. Kollox ieħor — analitika, marketing, faċilitajiet żejda — jitħaddem biss jekk tippermettih. Tista’ tbiddel il-fehma tiegħek f’kull ħin.',
    more: 'Aktar informazzjoni',
    acceptAll: 'Aċċetta kollox',
    rejectAll: 'Irrifjuta kollox',
    customize: 'Ippersonalizza',
    bannerLabel: 'Kunsens għall-cookies',
    panelTitle: 'Issettjar tal-cookies',
    panelIntro: 'Agħżel liema cookies tippermetti. Xejn fakultattiv mhu mixgħul sakemm ma tixgħelux int.',
    save: 'Issejvja l-għażla',
    close: 'Agħlaq',
    alwaysOn: 'dejjem attivi',
    cookiesIn: 'Cookies f’dan il-grupp',
    noCookies: 'Ma ġie ddikjarat l-ebda cookie għal dan il-grupp.',
    colName: 'Isem',
    colVendor: 'Fornitur',
    colPurpose: 'Skop',
    colExpiry: 'Skadenza',
    floating: 'Issettjar tal-cookies',
    cat: {
      necessary: { title: 'Meħtieġa', desc: 'Meħtieġa biex is-sit jaħdem — login, sigurtà, tifkira tal-kunsens tiegħek. Ma jistgħux jintfew.' },
      functional: { title: 'Funzjonali', desc: 'Jiftakru l-preferenzi tiegħek, bħal-lingwa jew iċ-chat, biex ma jkollokx terġa’ tissettjahom.' },
      analytics: { title: 'Analitika', desc: 'Juruna liema paġni jintużaw, biex nirranġaw dak li jħawwad. Numri biss, bla ismijiet.' },
      marketing: { title: 'Marketing', desc: 'Jippermettulna nurulek reklami fuq siti oħra u nkejlu jekk kinux ta’ siwi.' }
    }
  };

  L.nl = {
    bannerTitle: 'Wij gebruiken cookies',
    bannerText: 'Noodzakelijke cookies houden de site draaiende. Al het overige — statistieken, marketing, extra gemak — wordt alleen ingeschakeld als u dat toestaat. U kunt uw keuze altijd wijzigen.',
    more: 'Meer informatie',
    acceptAll: 'Alles accepteren',
    rejectAll: 'Alles weigeren',
    customize: 'Instellen',
    bannerLabel: 'Cookietoestemming',
    panelTitle: 'Cookie-instellingen',
    panelIntro: 'Kies welke cookies u toestaat. Niets optioneels staat aan totdat u het zelf aanzet.',
    save: 'Keuze opslaan',
    close: 'Sluiten',
    alwaysOn: 'altijd actief',
    cookiesIn: 'Cookies in deze groep',
    noCookies: 'Voor deze groep zijn geen cookies opgegeven.',
    colName: 'Naam',
    colVendor: 'Aanbieder',
    colPurpose: 'Doel',
    colExpiry: 'Vervalt',
    floating: 'Cookie-instellingen',
    cat: {
      necessary: { title: 'Noodzakelijk', desc: 'Nodig om de site te laten werken: inloggen, beveiliging en het onthouden van uw keuze. Ze kunnen niet uit.' },
      functional: { title: 'Functioneel', desc: 'Onthouden uw voorkeuren, zoals taal of chat, zodat u ze niet opnieuw hoeft in te stellen.' },
      analytics: { title: 'Statistieken', desc: 'Laten ons zien welke pagina’s worden gebruikt, zodat we verwarrende dingen kunnen verbeteren. Alleen cijfers, geen namen.' },
      marketing: { title: 'Marketing', desc: 'Stellen ons in staat u advertenties op andere sites te tonen en te meten of ze iets opleverden.' }
    }
  };

  L.pl = {
    bannerTitle: 'Używamy plików cookie',
    bannerText: 'Niezbędne pliki cookie utrzymują działanie strony. Cała reszta — analityka, marketing, dodatkowe udogodnienia — działa tylko za Pana/Pani zgodą. Decyzję można zmienić w każdej chwili.',
    more: 'Dowiedz się więcej',
    acceptAll: 'Zaakceptuj wszystkie',
    rejectAll: 'Odrzuć wszystkie',
    customize: 'Dostosuj',
    bannerLabel: 'Zgoda na pliki cookie',
    panelTitle: 'Ustawienia plików cookie',
    panelIntro: 'Proszę wybrać, na które pliki cookie wyrażają Państwo zgodę. Nic opcjonalnego nie jest włączone, dopóki sami tego nie włączycie.',
    save: 'Zapisz wybór',
    close: 'Zamknij',
    alwaysOn: 'zawsze aktywne',
    cookiesIn: 'Pliki cookie w tej grupie',
    noCookies: 'Dla tej grupy nie zadeklarowano plików cookie.',
    colName: 'Nazwa',
    colVendor: 'Dostawca',
    colPurpose: 'Cel',
    colExpiry: 'Wygasa',
    floating: 'Ustawienia plików cookie',
    cat: {
      necessary: { title: 'Niezbędne', desc: 'Potrzebne, by strona działała: logowanie, bezpieczeństwo, zapamiętanie zgody. Nie można ich wyłączyć.' },
      functional: { title: 'Funkcjonalne', desc: 'Zapamiętują ustawienia, na przykład język lub czat, żeby nie trzeba było wybierać ich ponownie.' },
      analytics: { title: 'Analityczne', desc: 'Pokazują nam, z których stron korzystają użytkownicy, byśmy poprawili to, co myli. Tylko liczby, bez nazwisk.' },
      marketing: { title: 'Marketingowe', desc: 'Pozwalają pokazywać reklamy na innych stronach i sprawdzać, czy przyniosły efekt.' }
    }
  };

  L.pt = {
    bannerTitle: 'Utilizamos cookies',
    bannerText: 'Os cookies necessários mantêm o site a funcionar. Tudo o resto — análise, marketing, funcionalidades extra — só é ativado se o permitir. Pode mudar de ideias a qualquer momento.',
    more: 'Saber mais',
    acceptAll: 'Aceitar tudo',
    rejectAll: 'Recusar tudo',
    customize: 'Personalizar',
    bannerLabel: 'Consentimento de cookies',
    panelTitle: 'Definições de cookies',
    panelIntro: 'Escolha que cookies permite. Nada opcional está ativo até que o ative.',
    save: 'Guardar escolhas',
    close: 'Fechar',
    alwaysOn: 'sempre ativos',
    cookiesIn: 'Cookies deste grupo',
    noCookies: 'Não foram declarados cookies para este grupo.',
    colName: 'Nome',
    colVendor: 'Fornecedor',
    colPurpose: 'Finalidade',
    colExpiry: 'Validade',
    floating: 'Definições de cookies',
    cat: {
      necessary: { title: 'Necessários', desc: 'Precisos para o site funcionar: início de sessão, segurança e memória do seu consentimento. Não podem ser desativados.' },
      functional: { title: 'Funcionais', desc: 'Guardam as suas preferências, como o idioma ou o chat, para não ter de as definir outra vez.' },
      analytics: { title: 'Análise', desc: 'Mostram-nos que páginas são usadas, para corrigirmos o que confunde. Apenas números, sem nomes.' },
      marketing: { title: 'Marketing', desc: 'Permitem mostrar-lhe anúncios noutros sites e medir se foram úteis.' }
    }
  };

  L.ro = {
    bannerTitle: 'Folosim cookie-uri',
    bannerText: 'Cookie-urile necesare mențin site-ul în funcțiune. Restul — analiză, marketing, funcții suplimentare — pornește doar dacă permiteți. Vă puteți răzgândi oricând.',
    more: 'Aflați mai multe',
    acceptAll: 'Acceptă tot',
    rejectAll: 'Respinge tot',
    customize: 'Personalizează',
    bannerLabel: 'Consimțământ pentru cookie-uri',
    panelTitle: 'Setări cookie-uri',
    panelIntro: 'Alegeți ce cookie-uri permiteți. Nimic opțional nu este pornit până nu îl porniți dumneavoastră.',
    save: 'Salvează alegerea',
    close: 'Închide',
    alwaysOn: 'mereu active',
    cookiesIn: 'Cookie-uri din acest grup',
    noCookies: 'Nu au fost declarate cookie-uri pentru acest grup.',
    colName: 'Nume',
    colVendor: 'Furnizor',
    colPurpose: 'Scop',
    colExpiry: 'Expiră',
    floating: 'Setări cookie-uri',
    cat: {
      necessary: { title: 'Necesare', desc: 'Sunt necesare pentru funcționarea site-ului: autentificare, securitate, reținerea consimțământului. Nu pot fi dezactivate.' },
      functional: { title: 'Funcționale', desc: 'Rețin preferințele dumneavoastră, precum limba sau chatul, ca să nu le setați din nou.' },
      analytics: { title: 'Analiză', desc: 'Ne arată ce pagini sunt folosite, ca să reparăm ce derutează. Doar cifre, fără nume.' },
      marketing: { title: 'Marketing', desc: 'Ne permit să vă arătăm reclame pe alte site-uri și să măsurăm dacă au fost de folos.' }
    }
  };

  L.sk = {
    bannerTitle: 'Používame súbory cookie',
    bannerText: 'Nevyhnutné súbory cookie udržiavajú stránku v chode. Všetko ostatné — analytika, marketing, doplnkové pohodlie — sa zapne len s vaším súhlasom. Rozhodnutie môžete kedykoľvek zmeniť.',
    more: 'Viac informácií',
    acceptAll: 'Prijať všetko',
    rejectAll: 'Odmietnuť všetko',
    customize: 'Nastaviť',
    bannerLabel: 'Súhlas so súbormi cookie',
    panelTitle: 'Nastavenia cookies',
    panelIntro: 'Vyberte, ktoré súbory cookie povolíte. Nič voliteľné nie je zapnuté, kým to sami nezapnete.',
    save: 'Uložiť voľbu',
    close: 'Zavrieť',
    alwaysOn: 'vždy aktívne',
    cookiesIn: 'Cookies v tejto skupine',
    noCookies: 'Pre túto skupinu nie sú uvedené žiadne cookies.',
    colName: 'Názov',
    colVendor: 'Poskytovateľ',
    colPurpose: 'Účel',
    colExpiry: 'Platnosť',
    floating: 'Nastavenia cookies',
    cat: {
      necessary: { title: 'Nevyhnutné', desc: 'Bez nich stránka nefunguje — prihlásenie, bezpečnosť, zapamätanie vášho súhlasu. Nedajú sa vypnúť.' },
      functional: { title: 'Funkčné', desc: 'Pamätajú si vaše nastavenia, napríklad jazyk alebo chat, aby ste ich nezadávali znova.' },
      analytics: { title: 'Analytické', desc: 'Ukazujú nám, ktoré stránky ľudia používajú, aby sme opravili to nejasné. Len čísla, žiadne mená.' },
      marketing: { title: 'Marketingové', desc: 'Umožňujú nám zobrazovať vám reklamy na iných stránkach a merať, či boli na niečo dobré.' }
    }
  };

  L.sl = {
    bannerTitle: 'Uporabljamo piškotke',
    bannerText: 'Nujni piškotki ohranjajo delovanje spletnega mesta. Vse ostalo — analitika, trženje, dodatne ugodnosti — se vklopi le z vašim soglasjem. Odločitev lahko kadar koli spremenite.',
    more: 'Več o tem',
    acceptAll: 'Sprejmi vse',
    rejectAll: 'Zavrni vse',
    customize: 'Nastavi',
    bannerLabel: 'Soglasje za piškotke',
    panelTitle: 'Nastavitve piškotkov',
    panelIntro: 'Izberite, katere piškotke dovolite. Nič neobveznega ni vklopljeno, dokler tega ne vklopite sami.',
    save: 'Shrani izbiro',
    close: 'Zapri',
    alwaysOn: 'vedno aktivni',
    cookiesIn: 'Piškotki v tej skupini',
    noCookies: 'Za to skupino piškotki niso navedeni.',
    colName: 'Ime',
    colVendor: 'Ponudnik',
    colPurpose: 'Namen',
    colExpiry: 'Poteče',
    floating: 'Nastavitve piškotkov',
    cat: {
      necessary: { title: 'Nujni', desc: 'Potrebni za delovanje spletnega mesta — prijava, varnost, pomnjenje vašega soglasja. Ni jih mogoče izklopiti.' },
      functional: { title: 'Funkcionalni', desc: 'Zapomnijo si vaše nastavitve, na primer jezik ali klepet, da jih ni treba določati znova.' },
      analytics: { title: 'Analitika', desc: 'Pokažejo nam, katere strani ljudje uporabljajo, da popravimo, kar je nejasno. Samo številke, brez imen.' },
      marketing: { title: 'Trženje', desc: 'Omogočajo nam, da vam prikazujemo oglase na drugih straneh in izmerimo, ali so bili koristni.' }
    }
  };

  L.sv = {
    bannerTitle: 'Vi använder cookies',
    bannerText: 'Nödvändiga cookies håller webbplatsen igång. Allt annat — statistik, marknadsföring, extra funktioner — startar bara om du tillåter det. Du kan ändra dig när som helst.',
    more: 'Läs mer',
    acceptAll: 'Godkänn alla',
    rejectAll: 'Avvisa alla',
    customize: 'Anpassa',
    bannerLabel: 'Cookiesamtycke',
    panelTitle: 'Cookieinställningar',
    panelIntro: 'Välj vilka cookies du tillåter. Inget valfritt är påslaget förrän du slår på det själv.',
    save: 'Spara val',
    close: 'Stäng',
    alwaysOn: 'alltid aktiva',
    cookiesIn: 'Cookies i denna grupp',
    noCookies: 'Inga cookies har angetts för denna grupp.',
    colName: 'Namn',
    colVendor: 'Leverantör',
    colPurpose: 'Syfte',
    colExpiry: 'Upphör',
    floating: 'Cookieinställningar',
    cat: {
      necessary: { title: 'Nödvändiga', desc: 'Krävs för att webbplatsen ska fungera — inloggning, säkerhet, minne av ditt samtycke. De kan inte stängas av.' },
      functional: { title: 'Funktionella', desc: 'Kommer ihåg dina inställningar, till exempel språk eller chatt, så att du slipper välja igen.' },
      analytics: { title: 'Statistik', desc: 'Visar oss vilka sidor som används, så att vi kan rätta till det som förvirrar. Bara siffror, inga namn.' },
      marketing: { title: 'Marknadsföring', desc: 'Låter oss visa dig annonser på andra webbplatser och mäta om de gjorde nytta.' }
    }
  };

  L.uk = {
    bannerTitle: 'Ми використовуємо файли cookie',
    bannerText: 'Необхідні файли cookie підтримують роботу сайту. Усе інше — аналітика, маркетинг, додаткові зручності — вмикається лише за вашою згодою. Рішення можна змінити будь-коли.',
    more: 'Докладніше',
    acceptAll: 'Прийняти все',
    rejectAll: 'Відхилити все',
    customize: 'Налаштувати',
    bannerLabel: 'Згода на файли cookie',
    panelTitle: 'Налаштування cookie',
    panelIntro: 'Виберіть, які файли cookie ви дозволяєте. Нічого необов’язкового не ввімкнено, доки ви цього не зробите.',
    save: 'Зберегти вибір',
    close: 'Закрити',
    alwaysOn: 'завжди активні',
    cookiesIn: 'Файли cookie цієї групи',
    noCookies: 'Для цієї групи файли cookie не заявлені.',
    colName: 'Назва',
    colVendor: 'Постачальник',
    colPurpose: 'Мета',
    colExpiry: 'Термін',
    floating: 'Налаштування cookie',
    cat: {
      necessary: { title: 'Необхідні', desc: 'Без них сайт не працює: вхід, безпека, пам’ять про ваш вибір. Вимкнути неможливо.' },
      functional: { title: 'Функціональні', desc: 'Запам’ятовують ваші налаштування — наприклад мову або чат, — щоб ви не задавали їх знову.' },
      analytics: { title: 'Аналітика', desc: 'Показують нам, якими сторінками користуються, щоб ми виправили незручне. Лише цифри, без імен.' },
      marketing: { title: 'Маркетинг', desc: 'Дозволяють показувати вам рекламу на інших сайтах і оцінювати, чи була з неї користь.' }
    }
  };

  L.tr = {
    bannerTitle: 'Çerezleri kullanıyoruz',
    bannerText: 'Zorunlu çerezler sitenin çalışmasını sağlar. Diğer her şey — analiz, pazarlama, ek kolaylıklar — yalnızca siz izin verirseniz çalışır. Kararınızı istediğiniz zaman değiştirebilirsiniz.',
    more: 'Daha fazla bilgi',
    acceptAll: 'Tümünü kabul et',
    rejectAll: 'Tümünü reddet',
    customize: 'Özelleştir',
    bannerLabel: 'Çerez onayı',
    panelTitle: 'Çerez ayarları',
    panelIntro: 'Hangi çerezlere izin verdiğinizi seçin. Siz açmadıkça isteğe bağlı hiçbir şey açık değildir.',
    save: 'Seçimi kaydet',
    close: 'Kapat',
    alwaysOn: 'her zaman etkin',
    cookiesIn: 'Bu gruptaki çerezler',
    noCookies: 'Bu grup için çerez bildirilmemiş.',
    colName: 'Ad',
    colVendor: 'Sağlayıcı',
    colPurpose: 'Amaç',
    colExpiry: 'Süre',
    floating: 'Çerez ayarları',
    cat: {
      necessary: { title: 'Zorunlu', desc: 'Sitenin çalışması için gerekli: oturum açma, güvenlik, onayınızın hatırlanması. Kapatılamazlar.' },
      functional: { title: 'İşlevsel', desc: 'Dil veya sohbet gibi tercihlerinizi hatırlar, böylece yeniden ayarlamanız gerekmez.' },
      analytics: { title: 'Analiz', desc: 'Hangi sayfaların kullanıldığını görmemizi sağlar, kafa karıştıranı düzeltiriz. Yalnızca sayılar, isim yok.' },
      marketing: { title: 'Pazarlama', desc: 'Başka sitelerde size reklam göstermemize ve işe yarayıp yaramadığını ölçmemize olanak tanır.' }
    }
  };

  L.no = {
    bannerTitle: 'Vi bruker informasjonskapsler',
    bannerText: 'Nødvendige informasjonskapsler holder nettstedet i gang. Alt annet — statistikk, markedsføring, ekstra funksjoner — slås bare på hvis du tillater det. Du kan ombestemme deg når som helst.',
    more: 'Les mer',
    acceptAll: 'Godta alle',
    rejectAll: 'Avvis alle',
    customize: 'Tilpass',
    bannerLabel: 'Samtykke til informasjonskapsler',
    panelTitle: 'Innstillinger for informasjonskapsler',
    panelIntro: 'Velg hvilke informasjonskapsler du tillater. Ingenting valgfritt er på før du slår det på selv.',
    save: 'Lagre valg',
    close: 'Lukk',
    alwaysOn: 'alltid aktive',
    cookiesIn: 'Informasjonskapsler i denne gruppen',
    noCookies: 'Ingen informasjonskapsler er oppgitt for denne gruppen.',
    colName: 'Navn',
    colVendor: 'Leverandør',
    colPurpose: 'Formål',
    colExpiry: 'Utløper',
    floating: 'Innstillinger for informasjonskapsler',
    cat: {
      necessary: { title: 'Nødvendige', desc: 'Kreves for at nettstedet skal virke — innlogging, sikkerhet, minne om samtykket ditt. De kan ikke slås av.' },
      functional: { title: 'Funksjonelle', desc: 'Husker innstillingene dine, som språk eller chat, så du slipper å velge på nytt.' },
      analytics: { title: 'Statistikk', desc: 'Viser oss hvilke sider som brukes, så vi kan rette opp det som forvirrer. Bare tall, ingen navn.' },
      marketing: { title: 'Markedsføring', desc: 'Lar oss vise deg annonser på andre nettsteder og måle om de var til nytte.' }
    }
  };

  // nb-NO resolves to "nb" (ck-ui slices to 2 chars); own copy, never a shared
  // reference with L.no — the merge below mutates locale objects in place.
  L.nb = JSON.parse(JSON.stringify(L.no));

  L.is = {
    bannerTitle: 'Við notum vefkökur',
    bannerText: 'Nauðsynlegar vefkökur halda vefnum gangandi. Allt annað — tölfræði, markaðssetning, aukaþægindi — fer aðeins í gang ef þú leyfir það. Þú getur skipt um skoðun hvenær sem er.',
    more: 'Nánar',
    acceptAll: 'Samþykkja allt',
    rejectAll: 'Hafna öllu',
    customize: 'Stillingar',
    bannerLabel: 'Samþykki fyrir vefkökum',
    panelTitle: 'Stillingar vefkaka',
    panelIntro: 'Veldu hvaða vefkökur þú leyfir. Ekkert valfrjálst er kveikt fyrr en þú kveikir á því sjálf.',
    save: 'Vista val',
    close: 'Loka',
    alwaysOn: 'alltaf virkar',
    cookiesIn: 'Vefkökur í þessum flokki',
    noCookies: 'Engar vefkökur eru skráðar fyrir þennan flokk.',
    colName: 'Heiti',
    colVendor: 'Þjónustuaðili',
    colPurpose: 'Tilgangur',
    colExpiry: 'Gildistími',
    floating: 'Stillingar vefkaka',
    cat: {
      necessary: { title: 'Nauðsynlegar', desc: 'Nauðsynlegar til að vefurinn virki — innskráning, öryggi, að muna samþykki þitt. Ekki er hægt að slökkva á þeim.' },
      functional: { title: 'Virknivefkökur', desc: 'Muna stillingar þínar, til dæmis tungumál eða spjall, svo þú þurfir ekki að velja aftur.' },
      analytics: { title: 'Tölfræði', desc: 'Sýna okkur hvaða síður eru notaðar svo við getum lagað það sem ruglar. Aðeins tölur, engin nöfn.' },
      marketing: { title: 'Markaðssetning', desc: 'Leyfa okkur að sýna þér auglýsingar á öðrum vefjum og mæla hvort þær komu að gagni.' }
    }
  };

  // Serbian: Cyrillic throughout, consistently across all strings.
  L.sr = {
    bannerTitle: 'Користимо колачиће',
    bannerText: 'Неопходни колачићи одржавају сајт у раду. Све остало — аналитика, маркетинг, додатне погодности — укључује се само уз вашу сагласност. Одлуку можете променити у сваком тренутку.',
    more: 'Сазнајте више',
    acceptAll: 'Прихвати све',
    rejectAll: 'Одбиј све',
    customize: 'Подеси',
    bannerLabel: 'Сагласност за колачиће',
    panelTitle: 'Подешавања колачића',
    panelIntro: 'Изаберите које колачиће дозвољавате. Ништа необавезно није укључено док то сами не укључите.',
    save: 'Сачувај избор',
    close: 'Затвори',
    alwaysOn: 'увек активни',
    cookiesIn: 'Колачићи у овој групи',
    noCookies: 'За ову групу нису наведени колачићи.',
    colName: 'Назив',
    colVendor: 'Пружалац',
    colPurpose: 'Сврха',
    colExpiry: 'Истиче',
    floating: 'Подешавања колачића',
    cat: {
      necessary: { title: 'Неопходни', desc: 'Потребни су да би сајт радио — пријава, безбедност, памћење ваше сагласности. Не могу се искључити.' },
      functional: { title: 'Функционални', desc: 'Памте ваша подешавања, на пример језик или ћаскање, да их не бисте бирали поново.' },
      analytics: { title: 'Аналитика', desc: 'Показују нам које се странице користе како бисмо исправили оно што збуњује. Само бројеви, без имена.' },
      marketing: { title: 'Маркетинг', desc: 'Омогућавају нам да вам приказујемо огласе на другим сајтовима и измеримо да ли су били од користи.' }
    }
  };

  L.ca = {
    bannerTitle: 'Utilitzem galetes',
    bannerText: 'Les galetes necessàries mantenen el lloc en funcionament. Tota la resta — analítica, màrqueting, funcions addicionals — només s’activa si ho permeteu. Podeu canviar d’opinió en qualsevol moment.',
    more: 'Més informació',
    acceptAll: 'Accepta-ho tot',
    rejectAll: 'Rebutja-ho tot',
    customize: 'Personalitza',
    bannerLabel: 'Consentiment de galetes',
    panelTitle: 'Configuració de galetes',
    panelIntro: 'Trieu quines galetes permeteu. Res opcional no està activat fins que no ho activeu vosaltres.',
    save: 'Desa la selecció',
    close: 'Tanca',
    alwaysOn: 'sempre actives',
    cookiesIn: 'Galetes d’aquest grup',
    noCookies: 'No s’ha declarat cap galeta per a aquest grup.',
    colName: 'Nom',
    colVendor: 'Proveïdor',
    colPurpose: 'Finalitat',
    colExpiry: 'Caduca',
    floating: 'Configuració de galetes',
    cat: {
      necessary: { title: 'Necessàries', desc: 'Calen perquè el lloc funcioni: inici de sessió, seguretat i memòria del vostre consentiment. No es poden desactivar.' },
      functional: { title: 'Funcionals', desc: 'Recorden les vostres preferències, com l’idioma o el xat, perquè no les hàgiu de tornar a configurar.' },
      analytics: { title: 'Analítica', desc: 'Ens mostren quines pàgines es fan servir per corregir allò que confon. Només xifres, sense noms.' },
      marketing: { title: 'Màrqueting', desc: 'Ens permeten mostrar-vos anuncis en altres llocs i mesurar si han servit d’alguna cosa.' }
    }
  };

  L.sq = {
    bannerTitle: 'Ne përdorim cookie-t',
    bannerText: 'Cookie-t e nevojshme e mbajnë faqen në punë. Gjithçka tjetër — analitika, marketingu, lehtësirat shtesë — aktivizohet vetëm nëse e lejoni. Mund ta ndryshoni vendimin në çdo kohë.',
    more: 'Mëso më shumë',
    acceptAll: 'Prano të gjitha',
    rejectAll: 'Refuzo të gjitha',
    customize: 'Përshtat',
    bannerLabel: 'Pëlqimi për cookie-t',
    panelTitle: 'Cilësimet e cookie-ve',
    panelIntro: 'Zgjidhni cilat cookie lejoni. Asgjë opsionale nuk është e ndezur derisa ta ndizni vetë.',
    save: 'Ruaj zgjedhjen',
    close: 'Mbyll',
    alwaysOn: 'gjithmonë aktive',
    cookiesIn: 'Cookie-t e këtij grupi',
    noCookies: 'Nuk ka cookie të deklaruara për këtë grup.',
    colName: 'Emri',
    colVendor: 'Ofruesi',
    colPurpose: 'Qëllimi',
    colExpiry: 'Skadon',
    floating: 'Cilësimet e cookie-ve',
    cat: {
      necessary: { title: 'Të nevojshme', desc: 'Nevojiten që faqja të funksionojë — hyrja, siguria, ruajtja e pëlqimit tuaj. Nuk mund të fiken.' },
      functional: { title: 'Funksionale', desc: 'Mbajnë mend preferencat tuaja, si gjuha ose biseda, që të mos i vendosni sërish.' },
      analytics: { title: 'Analitika', desc: 'Na tregojnë cilat faqe përdoren, që të rregullojmë atë që ngatërron. Vetëm numra, pa emra.' },
      marketing: { title: 'Marketingu', desc: 'Na lejojnë t’ju shfaqim reklama në faqe të tjera dhe të matim nëse patën ndonjë dobi.' }
    }
  };

  L.mk = {
    bannerTitle: 'Користиме колачиња',
    bannerText: 'Неопходните колачиња ја одржуваат страницата во работа. Сè останато — аналитика, маркетинг, дополнителни погодности — се вклучува само со ваша согласност. Одлуката можете да ја промените во секое време.',
    more: 'Дознајте повеќе',
    acceptAll: 'Прифати сè',
    rejectAll: 'Одбиј сè',
    customize: 'Прилагоди',
    bannerLabel: 'Согласност за колачиња',
    panelTitle: 'Поставки за колачиња',
    panelIntro: 'Изберете кои колачиња ги дозволувате. Ништо изборно не е вклучено додека сами не го вклучите.',
    save: 'Зачувај избор',
    close: 'Затвори',
    alwaysOn: 'секогаш активни',
    cookiesIn: 'Колачиња во оваа група',
    noCookies: 'За оваа група не се наведени колачиња.',
    colName: 'Име',
    colVendor: 'Доставувач',
    colPurpose: 'Цел',
    colExpiry: 'Истекува',
    floating: 'Поставки за колачиња',
    cat: {
      necessary: { title: 'Неопходни', desc: 'Потребни се за страницата да работи — најава, безбедност, помнење на вашата согласност. Не можат да се исклучат.' },
      functional: { title: 'Функционални', desc: 'Ги паметат вашите поставки, на пример јазикот или разговорот, за да не ги задавате повторно.' },
      analytics: { title: 'Аналитика', desc: 'Ни покажуваат кои страници се користат за да го поправиме тоа што збунува. Само бројки, без имиња.' },
      marketing: { title: 'Маркетинг', desc: 'Ни овозможуваат да ви прикажуваме реклами на други страници и да измериме дали имало корист од нив.' }
    }
  };

  /* ------------------------------------------------------------------ merge */
  /* Per-key merge, existing wins: a host that pre-defined window.__ckLocales
     (even partially, e.g. only de.acceptAll) keeps its overrides and still gets
     every key it did not define. `cat` is merged one level deeper. */

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function fillCat(target, source) {
    for (var cat in source) {
      if (!Object.prototype.hasOwnProperty.call(source, cat)) continue;
      if (!isObj(target[cat])) { target[cat] = { title: source[cat].title, desc: source[cat].desc }; continue; }
      for (var f in source[cat]) {
        if (!Object.prototype.hasOwnProperty.call(source[cat], f)) continue;
        if (target[cat][f] === undefined) target[cat][f] = source[cat][f];
      }
    }
  }

  var store = window.__ckLocales;
  if (!isObj(store)) store = {};

  for (var code in L) {
    if (!Object.prototype.hasOwnProperty.call(L, code)) continue;
    var pack = L[code];
    var existing = store[code];
    if (!isObj(existing)) { store[code] = pack; continue; }
    for (var key in pack) {
      if (!Object.prototype.hasOwnProperty.call(pack, key)) continue;
      if (key === 'cat') {
        if (!isObj(existing.cat)) existing.cat = {};
        fillCat(existing.cat, pack.cat);
      } else if (existing[key] === undefined) {
        existing[key] = pack[key];
      }
    }
  }

  window.__ckLocales = store;
})();
