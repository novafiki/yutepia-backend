// =========================================================
// YUTEPIA - FRUTIGER AERO SOHBET & GRUP MODÜLÜ (chat.js)
// =========================================================

let isFetchingGroups = false;
let isFetchingChat = false;
let activeChatAbortController = null;

let activeChatTab = 'direct'; // 'direct' (Sohbet) veya 'groups' (Grup)
let activeChatPartner = null;
let activeChatGroup = null;
let currentChatMessages = [];
let chatPollInterval = null;
let lastAnimatedTopFriendId = null;
let giphySearchTimeout = null;
let chatSearchDebounceTimer = null;
let leftSearchDebounceTimer = null;

// Konuşma geçmişini RAM'de tutar (Arkadaşlar arası geçiş 0ms sürer)
const conversationMemoryCache = new Map();
let lastRenderedChatSignature = '';

// SESLİ MESAJ KAYIT DEĞİŞKENLERİ
let mediaRecorder = null;
let audioChunks = [];
let isRecordingVoice = false;
let voiceRecInterval = null;
let voiceRecSeconds = 0;

// YERLEŞİK HIZLI GIF YEDEK ARŞİVİ
const FALLBACK_GIFS_DB = [
    { tags: 'anime wave hello hi merhaba selam', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN5dG9wM3R3bmJ5cnZ5eHh4eHh4eHh4eHh4eHh4eHh4eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ICOgUNjpvO0PC/giphy.gif' },
    { tags: 'cat kedi cute sevimli love kalp', url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif' },
    { tags: 'dance dans party eğlence happy mutlu', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
    { tags: 'cat vibe music müzik dans kedi', url: 'https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif' },
    { tags: 'happy mutlu yay smile gülümse anime', url: 'https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif' },
    { tags: 'laugh komik haha lol gülmek', url: 'https://media.giphy.com/media/10UeedrT5MIfPG/giphy.gif' },
    { tags: 'sad üzgün cry ağlamak anime yağmur', url: 'https://media.giphy.com/media/ROF8OQvDmxytW/giphy.gif' },
    { tags: 'angry kızgın sinirli anime rage', url: 'https://media.giphy.com/media/11tTNkNy1SdXGg/giphy.gif' },
    { tags: 'love kalp hug sarılmak cute anime', url: 'https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif' },
    { tags: 'thumbs up ok tamam super harika', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
    { tags: 'fire ateş cool havalı', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
    { tags: 'cat wiggle shake dans kedi komik', url: 'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif' }
];

// %100 WINDOWS 10 / 11 (SEGOE UI EMOJI) UYUMLU EMOJİ VERİTABANI
const EMOJI_CATEGORIES = [
    {
        id: 'smileys',
        icon: '😀',
        title: '😀 Yüzler & Duygular',
        emojis: [
            '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','😍','🤩','😘','😗','😚','😙','😋','😛',
            '😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪',
            '🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁',
            '😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','😤','😡',
            '😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'
        ]
    },
    {
        id: 'people',
        icon: '👋',
        title: '👋 Eller & İnsanlar',
        emojis: [
            '👋','🤚','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','👍','👎','✊','👊','🤛',
            '🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦵','🦶','👂','👃','🧠','🦷','🦴','👀','👅','👄',
            '👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🙇','🤦','🤷',
            '👮','🕵️','💂','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜',
            '🧝','🧞','🧟','💃','🕺','🕴️','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸'
        ]
    },
    {
        id: 'animals',
        icon: '🐱',
        title: '🐱 Hayvanlar & Doğa',
        emojis: [
            '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔',
            '🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗',
            '🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊',
            '🐅','🐆','🦓','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌',
            '🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🕊️','🐇','🦝','🦨','🦡','🐁','🐀','🐿️','🦔','🐾','🐉','🐲','🌵',
            '🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍','🎋','🍃','🍂','🍁','🍄','🐚','🌾','💐','🌷','🌹','🥀','🌺',
            '🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌎','🌍','🌏','💫',
            '⭐','🌟','✨','⚡','☄️','💥','🔥','🌪️','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️',
            '⛄','🌬️','💨','💧','💦','☔','☂️','🌊'
        ]
    },
    {
        id: 'food',
        icon: '🍔',
        title: '🍔 Yiyecek & İçecek',
        emojis: [
            '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬',
            '🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩',
            '🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🥫','🍝','🍜','🍲','🍛','🍣','🍱',
            '🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬',
            '🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹',
            '🧉','🍾','🧊','🥄','🍴','🍽️','🥣','🥡','🥢','🧂'
        ]
    },
    {
        id: 'activities',
        icon: '⚽',
        title: '⚽ Aktivite, Oyun & Spor',
        emojis: [
            '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','🪁','🏹',
            '🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🥌','🎿','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪',
            '🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🎰','🧩',
            '🧸','♠️','♥️','♦️','♣️','🃏','🀄','🎴','🎀','🎁','🎊','🎉','🎈','🎏','🎐','🧧','🎃'
        ]
    },
    {
        id: 'travel',
        icon: '🚗',
        title: '🚗 Seyahat & Mekanlar',
        emojis: [
            '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🦯','🦽','🦼','🛴','🚲','🛵','🏍️','🛺',
            '🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️',
            '🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','⛽','🚧','🚦','🚥','🚏',
            '🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺',
            '🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍',
            '🛕','🕋','⛩️','🛤️','🛣️','🗾','🎑','🏞️','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙️','🌃','🌌','🌉','🌁'
        ]
    },
    {
        id: 'objects',
        icon: '💡',
        title: '💡 Nesneler & Teknoloji',
        emojis: [
            '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️',
            '🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡',
            '🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️',
            '🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭',
            '🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼',
            '🪒','🧽','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🖼️','🛍️','🛒','🎁','🎈','🎏','🎀','🎊','🎉',
            '✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊',
            '📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕',
            '📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️',
            '📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'
        ]
    },
    {
        id: 'symbols',
        icon: '❤️',
        title: '❤️ Kalpler & Semboller',
        emojis: [
            '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️',
            '☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒',
            '♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵',
            '🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱',
            '🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹',
            '❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼',
            '🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','🔢','▶️','⏸️','⏯️','⏹️',
            '⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️',
            '↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','♾️','💲','💱','™️','©️','®️','〰️',
            '➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻',
            '🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫',
            '🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️'
        ]
    }
];
let activeEmojiCatId = 'smileys';
const emojiCategoryHtmlCache = {};

let chatBgInput = null;
let chatCustomBg = null;
let resetChatBgBtn = null;

// 1. SOHBET STİLLERİNİ VE HTML YAPISINI ANINDA ENJEKTE ET
(function mountChatModule() {
    const styleEl = document.createElement('style');
    styleEl.id = 'yutepia-chat-styles';
    styleEl.textContent = `
        .chat-left-header-row {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            margin-bottom: 10px; position: relative; z-index: 2;
        }
        .chat-mode-tabs-row {
            display: flex; gap: 6px; margin-bottom: 10px; position: relative; z-index: 2;
        }
        .chat-mode-tab-btn {
            flex: 1; padding: 7px 10px; border-radius: 14px; font-size: 12.5px; font-weight: 900;
            color: #fff; cursor: pointer; text-align: center;
            border: 1.5px solid rgba(255, 255, 255, 0.75);
            background: rgba(255, 255, 255, 0.22);
            text-shadow: 0 1px 2px rgba(0, 30, 75, 0.9);
            transition: background 0.12s ease, transform 0.1s ease;
        }
        .chat-mode-tab-btn:hover { background: rgba(255, 255, 255, 0.38); }
        .chat-mode-tab-btn.active {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.9) 100%);
            border-color: #ffffff;
            box-shadow: 0 4px 10px rgba(0, 40, 95, 0.35), inset 0 1px 3px #fff;
            color: #002b55;
            text-shadow: 0 1px 0 #fff;
        }
        .friend-search-well {
            display: flex; align-items: center; gap: 6px;
            background: rgba(255, 255, 255, 0.78);
            border: 1.5px solid #fff; border-radius: 14px;
            padding: 6px 11px; margin-bottom: 10px; position: relative; z-index: 2;
            box-shadow: inset 0 2px 4px rgba(0, 35, 80, 0.15);
        }
        .friend-search-well input {
            width: 100%; border: none; background: transparent; outline: none;
            font-size: 12.5px; color: #003366; font-weight: 800; user-select: text;
        }
        .friend-search-well input::placeholder { color: #3a6b9c; }
        .chat-main-panel {
            display: flex; flex-direction: column; height: 615px; padding: 14px; overflow: hidden;
        }
        .chat-top-bar {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding-bottom: 10px; border-bottom: 1.5px solid rgba(255, 255, 255, 0.6);
            position: relative; z-index: 20;
        }
        .chat-partner-info { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .chat-partner-details { display: flex; flex-direction: column; min-width: 0; }
        .chat-partner-name { font-size: 16.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-toolbar-actions { display: flex; align-items: center; gap: 10px; position: relative; }
        .chat-right-btn-stack { display: flex; flex-direction: column; gap: 5px; align-items: stretch; }
        .chat-search-box {
            display: flex; align-items: center; background: rgba(255, 255, 255, 0.78);
            border: 1.5px solid #fff; border-radius: 14px; padding: 5px 11px; gap: 5px;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.15);
        }
        .chat-search-box input {
            border: none; background: transparent; outline: none; font-size: 12px;
            color: #003366; font-weight: 800; width: 125px; user-select: text;
        }
        .pinned-dropdown-popover {
            position: absolute; top: calc(100% + 6px); right: 0; width: 320px; max-height: 290px;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.94));
            border: 2px solid #fff; border-radius: 16px; padding: 11px;
            box-shadow: 0 12px 28px rgba(0, 35, 85, 0.55), inset 0 2px 5px #fff;
            display: none; flex-direction: column; gap: 8px; z-index: 99;
        }
        .pinned-list-scroll { overflow-y: auto; max-height: 225px; display: flex; flex-direction: column; gap: 6px; padding-right: 3px; }
        .pinned-list-item {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
            padding: 8px 10px; border-radius: 11px; background: rgba(255, 255, 255, 0.78);
            border: 1.5px solid #fff; color: #003366; cursor: pointer; transition: transform 0.1s, background 0.12s;
        }
        .pinned-list-item:hover { background: #fff; transform: translateX(-2px); }
        .pinned-list-item-content { flex: 1; min-width: 0; font-size: 12px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chat-messages-viewport {
            flex: 1; margin: 10px 0; border-radius: 14px; position: relative; overflow: hidden;
            border: 1.5px solid rgba(255, 255, 255, 0.85);
            background: rgba(255, 255, 255, 0.25);
            box-shadow: inset 0 2px 10px rgba(0, 30, 75, 0.22);
            display: flex; flex-direction: column;
            contain: strict;
        }
        .chat-custom-bg {
            position: absolute; inset: 0; background-position: center; background-size: cover;
            background-repeat: no-repeat; opacity: 0.85; pointer-events: none; z-index: 0;
        }
        .chat-messages-list {
            position: relative; z-index: 1; flex: 1; overflow-y: auto; padding: 14px;
            display: flex; flex-direction: column; gap: 10px;
            contain: content;
        }
        .chat-messages-list::-webkit-scrollbar { width: 7px; }
        .chat-messages-list::-webkit-scrollbar-track { background: rgba(255,255,255,0.2); border-radius: 4px; }
        .chat-messages-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.85); border-radius: 4px; }
        .msg-row { display: flex; flex-direction: column; max-width: 76%; position: relative; transition: transform 0.2s; }
        .msg-row.mine { align-self: flex-end; align-items: flex-end; }
        .msg-row.theirs { align-self: flex-start; align-items: flex-start; }
        .msg-row.highlight-jump .msg-bubble {
            box-shadow: 0 0 22px #fff, 0 0 12px #ffd93b, inset 0 2px 6px #fff !important;
            border-color: #ffd93b !important;
        }
        .msg-sender-label {
            font-size: 11px; font-weight: 900; color: #004d80; margin-bottom: 2px;
            text-shadow: 0 1px 0 rgba(255,255,255,0.8);
        }
        .msg-bubble {
            padding: 9px 13px; border-radius: 16px; position: relative;
            border: 1.5px solid rgba(255, 255, 255, 0.92);
            box-shadow: 0 3px 10px rgba(0, 35, 80, 0.22), inset 0 1px 3px rgba(255, 255, 255, 0.95);
            word-break: break-word; user-select: text;
        }
        .msg-row.mine .msg-bubble {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.92) 100%);
            color: #002b55; font-weight: 800; border-bottom-right-radius: 4px;
        }
        .msg-row.theirs .msg-bubble {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(230, 247, 255, 0.94) 100%);
            color: #003366; font-weight: 800; border-bottom-left-radius: 4px;
        }
        .msg-text { font-size: 13.5px; line-height: 1.38; white-space: pre-wrap; }
        .msg-meta-bar { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 10px; opacity: 0.85; }
        .pin-action-btn {
            background: rgba(255,255,255,0.7); border: 1px solid #fff; border-radius: 8px;
            padding: 1px 5px; font-size: 10px; cursor: pointer; color: #003366; font-weight: 800;
        }
        .pin-action-btn:hover { background: #fff; transform: scale(1.06); }
        .msg-media-img {
            max-width: 250px; max-height: 220px; border-radius: 11px; border: 1.5px solid #fff;
            margin-top: 5px; display: block; cursor: pointer; object-fit: cover;
            box-shadow: 0 3px 8px rgba(0,0,0,0.2);
        }
        .msg-audio-player { width: 235px; height: 36px; margin-top: 5px; border-radius: 10px; }
        .voice-recording-bar {
            display: none; align-items: center; justify-content: space-between; gap: 10px;
            background: linear-gradient(90deg, rgba(255, 235, 238, 0.95), rgba(255, 255, 255, 0.9));
            border: 2px solid #ff5252; border-radius: 14px; padding: 7px 14px; margin-bottom: 8px;
            color: #b71c1c; font-size: 12.5px; font-weight: 900;
            box-shadow: 0 4px 12px rgba(183, 28, 28, 0.25); position: relative; z-index: 10;
        }
        .voice-rec-dot {
            width: 11px; height: 11px; border-radius: 50%; background: #d50000;
            display: inline-block; animation: pulseRec 1s infinite alternate;
        }
        @keyframes pulseRec { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0.35; transform: scale(1.25); } }
        .chat-composer-bar { display: flex; align-items: center; gap: 8px; position: relative; z-index: 15; }
        .chat-tool-btn {
            width: 38px; height: 38px; border-radius: 12px; border: 1.5px solid #fff;
            background: linear-gradient(180deg, rgba(255,255,255,0.75), rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.85));
            color: #003366; font-weight: 900; font-size: 15px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 3px 7px rgba(0, 35, 80, 0.3), inset 0 1px 2px #fff; flex-shrink: 0;
            transition: filter 0.1s, transform 0.08s;
        }
        .chat-tool-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .chat-tool-btn:active { transform: scale(0.95); }
        .chat-tool-btn.recording-active {
            background: linear-gradient(180deg, #ff8a8a, #d50000); color: #fff;
            box-shadow: 0 0 12px rgba(213, 0, 0, 0.8);
        }
        .chat-Floating-Popover {
            position: absolute; bottom: 50px; left: 0; width: 348px;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.95));
            border: 2px solid #fff; border-radius: 18px; padding: 11px;
            box-shadow: 0 12px 28px rgba(0, 35, 80, 0.55), inset 0 2px 5px #fff;
            display: none; flex-direction: column; gap: 8px; z-index: 60;
            overflow: hidden;
        }
        .emoji-cat-tabs {
            display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 3px;
            background: rgba(255, 255, 255, 0.65); padding: 4px; border-radius: 12px; border: 1px solid #fff;
        }
        .emoji-cat-tab {
            display: flex; align-items: center; justify-content: center;
            height: 30px; font-size: 16px; border-radius: 8px;
            cursor: pointer; transition: background 0.12s, transform 0.1s;
            font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
        }
        .emoji-cat-tab:hover { background: rgba(255, 255, 255, 0.85); }
        .emoji-cat-tab.active {
            background: linear-gradient(180deg, #fff, rgba(var(--panel-r), var(--panel-g), var(--panel-b), 0.8));
            box-shadow: 0 2px 5px rgba(0, 40, 90, 0.25); transform: scale(1.05);
        }
        .emoji-cat-label { font-size: 11.5px; font-weight: 900; color: #003366; padding-left: 2px; }
        .emoji-grid {
            display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px;
            height: 200px; overflow-y: auto; overflow-x: hidden; padding-right: 4px;
            align-content: start; contain: content;
        }
        .emoji-grid::-webkit-scrollbar, .gif-grid::-webkit-scrollbar { width: 6px; height: 0px; }
        .emoji-grid::-webkit-scrollbar-thumb, .gif-grid::-webkit-scrollbar-thumb { background: rgba(0, 60, 120, 0.35); border-radius: 4px; }
        .emoji-item {
            width: 100%; height: 38px; display: flex; align-items: center; justify-content: center;
            font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
            font-size: 21px; line-height: 1; cursor: pointer; border-radius: 8px;
            transition: background 0.1s, transform 0.1s; overflow: hidden;
        }
        .emoji-item:hover { background: rgba(255,255,255,0.9); transform: scale(1.15); }
        .gif-grid {
            display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px;
            height: 215px; overflow-y: auto; overflow-x: hidden; padding-right: 3px;
            align-content: start; contain: content;
        }
        .gif-item { width: 100%; height: 88px; object-fit: cover; border-radius: 9px; border: 1.5px solid #fff; cursor: pointer; transition: transform 0.12s; background: rgba(255,255,255,0.4); }
        .gif-item:hover { transform: scale(1.03); border-color: #ffd93b; }
        .group-friends-pick-list {
            max-height: 190px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
            margin: 8px 0; padding-right: 4px; text-align: left;
        }
        .group-friend-pick-row {
            display: flex; align-items: center; gap: 10px; padding: 6px 10px;
            border-radius: 11px; background: rgba(255, 255, 255, 0.72); border: 1.5px solid #fff;
            color: #003366; font-size: 13px; font-weight: 800; cursor: pointer;
        }
        .group-friend-pick-row input[type="checkbox"] { width: 17px; height: 17px; accent-color: #0066cc; cursor: pointer; }
        .group-friend-pick-row img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #fff; }
    `;
    document.head.appendChild(styleEl);

    // Grup Oluşturma Modalı ve Gizli Sohbet Arka Planı Dosya Girişi
    const extraOverlays = document.createElement('div');
    extraOverlays.innerHTML = `
        <div id="create-group-modal" class="modal-overlay">
            <div class="modal-content" style="width: 410px;">
                <span class="close-modal-btn" onclick="closeCreateGroupModal()">×</span>
                <h2 class="aero-text" style="font-size: 21px; margin-bottom: 8px;">👥 Grup Sohbeti Oluştur</h2>
                <input type="text" id="new-group-name-input" class="auth-input" placeholder="Grup adını yazın (örn: Anime Kulübü)...">
                <div style="text-align: left; font-size: 12.5px; font-weight: 900; color: #003366; margin-top: 8px;">Gruba Eklenecek Arkadaşlarını Seç:</div>
                <div class="group-friends-pick-list" id="group-friends-pick-list"></div>
                <button class="aqua-btn" id="submit-create-group-btn" style="width: 100%; padding: 10px; font-size: 14px; margin-top: 8px;" onclick="handleCreateGroup()">✨ Grubu Oluştur</button>
            </div>
        </div>
        <input type="file" id="chat-bg-input" accept="image/*,image/gif" style="display: none;">
    `;
    document.body.appendChild(extraOverlays);

    // Ana Sohbet Ekranı (#chat-screen-view) İçeriği
    const chatScreenEl = document.getElementById('chat-screen-view');
    if (chatScreenEl) {
        chatScreenEl.innerHTML = `
            <!-- SOL: SOHBET & GRUP SEKMELERİ + ARAMA -->
            <aside class="aero-panel" style="height: 615px; display: flex; flex-direction: column;">
                <svg class="water-crest"><use href="#water-splash"/></svg>
                
                <div class="chat-left-header-row">
                    <h2 class="panel-heading aero-text" style="margin-bottom:0;">Sohbetler</h2>
                    <button class="aqua-btn" style="padding: 4px 10px; font-size: 11.5px;" onclick="openCreateGroupModal()">➕ Grup Oluştur</button>
                </div>

                <div class="chat-mode-tabs-row">
                    <div class="chat-mode-tab-btn active" id="tab-btn-direct" onclick="switchChatListTab('direct')">💬 Sohbet</div>
                    <div class="chat-mode-tab-btn" id="tab-btn-groups" onclick="switchChatListTab('groups')">👥 Grup</div>
                </div>
                
                <div class="friend-search-well">
                    <span>🔍</span>
                    <input type="text" id="chat-friend-search-input" placeholder="Kullanıcı adı ara..." oninput="onLeftSearchInput()">
                </div>

                <div class="scrollable-list" id="chat-friends-list" style="max-height: 470px; flex: 1;">
                    <p class="aero-text" style="font-size:12px; text-align:center;">Önce giriş yapın.</p>
                </div>
            </aside>

            <!-- ORTA: FRUTIGER AERO SOHBET PENCERESİ -->
            <main class="aero-panel chat-main-panel">
                <svg class="water-crest"><use href="#water-splash"/></svg>
                
                <div class="chat-top-bar" id="chat-top-bar">
                    <div class="chat-partner-info">
                        <div class="avatar-wrap" id="chat-partner-avatar-wrap" style="width: 44px; height: 44px; display: none;">
                            <img id="chat-partner-avatar" src="" alt="Partner" decoding="async">
                        </div>
                        <div class="chat-partner-details">
                            <span class="chat-partner-name aero-text" id="chat-partner-name">Sohbet Başlat</span>
                            <span class="aero-text" id="chat-partner-status" style="font-size: 11px; opacity: 0.9;">Soldaki listeden bir sohbet veya grup seç</span>
                        </div>
                    </div>

                    <div class="chat-toolbar-actions">
                        <div class="chat-search-box" title="Sohbette Mesaj Ara">
                            <span>🔍</span>
                            <input type="text" id="chat-search-input" placeholder="Mesaj ara..." oninput="onChatSearchInput()">
                        </div>

                        <div class="chat-right-btn-stack">
                            <div style="display:flex; gap:4px;">
                                <button class="aqua-btn" style="flex:1; padding: 3px 10px; font-size: 11.5px;" title="Sohbet Arka Planı Yükle (Resim veya GIF - Maks 10MB)" onclick="triggerChatBgUpload()">🖼️ Arka Plan</button>
                                <button class="aqua-btn" id="reset-chat-bg-btn" title="Sohbet Arka Planını Sıfırla" style="display:none; padding: 3px 7px; font-size: 11px;" onclick="resetChatBg()">✕</button>
                            </div>
                            <button class="aqua-btn" id="pinned-messages-btn" style="padding: 3px 10px; font-size: 11.5px;" onclick="togglePinnedDropdown(event)">
                                📌 Sabitlenenler (<span id="pinned-count-badge">0</span>)
                            </button>
                        </div>

                        <div class="pinned-dropdown-popover" id="pinned-dropdown-popover" onclick="event.stopPropagation()">
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; font-weight:900; color:#003366; border-bottom:1px solid rgba(0,51,102,0.2); padding-bottom:5px;">
                                <span>📌 Sabitlenmiş Mesajlar</span>
                                <span style="cursor:pointer; font-size:16px;" onclick="closePinnedDropdown()">×</span>
                            </div>
                            <div class="pinned-list-scroll" id="pinned-list-scroll"></div>
                        </div>
                    </div>
                </div>

                <div class="chat-messages-viewport">
                    <div class="chat-custom-bg" id="chat-custom-bg"></div>
                    <div class="chat-messages-list" id="chat-messages-list">
                        <div style="margin: auto; text-align: center; padding: 30px;">
                            <div style="font-size: 40px; margin-bottom: 8px;">💬</div>
                            <p class="aero-text" style="font-size: 15px;">Sohbete başlamak için soldan bir arkadaşını veya grubu seç!</p>
                            <span class="aero-text" style="font-size: 11.5px; opacity: 0.85;">Mesaj, GIF, emoji ve sesli mesaj gönderebilirsin.</span>
                        </div>
                    </div>
                </div>

                <div class="voice-recording-bar" id="voice-recording-bar">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="voice-rec-dot"></span>
                        <span id="voice-rec-timer">Ses kaydediliyor... 00:00</span>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="aqua-btn" style="background:linear-gradient(180deg,#ff8a8a,#c62828); padding:4px 10px; font-size:11.5px;" onclick="cancelVoiceRecording()">✕ İptal</button>
                        <button class="aqua-btn" style="padding:4px 12px; font-size:11.5px;" onclick="finishAndSendVoiceRecording()">Gönder ➤</button>
                    </div>
                </div>

                <div class="chat-composer-bar" id="chat-composer-bar">
                    <div class="chat-Floating-Popover" id="emoji-popover" onclick="event.stopPropagation()">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:900; color:#003366;">
                            <span id="emoji-cat-title" class="emoji-cat-label">😀 Yüzler & Duygular</span>
                            <span style="cursor:pointer; font-size:16px;" onclick="closeChatPopovers()">×</span>
                        </div>
                        <div class="emoji-cat-tabs" id="emoji-cat-tabs"></div>
                        <input type="text" id="emoji-search-filter" class="auth-input" style="margin:0; padding:5px 9px; font-size:11.5px;" placeholder="🔍 Kategori ara (yüz, el, hayvan, yemek, kalp)..." oninput="renderEmojiCategoryGrid()">
                        <div class="emoji-grid" id="emoji-grid"></div>
                    </div>

                    <div class="chat-Floating-Popover" id="gif-popover" style="width: 348px;" onclick="event.stopPropagation()">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:900; color:#003366;">
                            <span>🎬 GIF Ara ve Gönder</span>
                            <span style="cursor:pointer; font-size:16px;" onclick="closeChatPopovers()">×</span>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="giphy-search-input" class="auth-input" style="margin:0; padding:6px 10px; font-size:12px;" placeholder="🔍 GIF ara (örn: anime, cat, happy, dance)..." oninput="onGiphySearchInput()">
                        </div>
                        <div class="gif-grid" id="gif-grid"></div>
                    </div>

                    <button class="chat-tool-btn" title="Emoji Ekle" onclick="toggleEmojiPopover(event)">😀</button>
                    <button class="chat-tool-btn" title="GIF Ara ve Gönder" style="font-size: 11.5px;" onclick="toggleGifPopover(event)">GIF</button>
                    <button class="chat-tool-btn" id="voice-record-btn" title="Sesli Mesaj Gönder" onclick="toggleVoiceRecording()">🎤</button>

                    <div class="composer-input-well" style="height: 40px;">
                        <input type="text" id="chat-msg-input" placeholder="Mesajını yaz..." onkeydown="if(event.key==='Enter'){event.preventDefault(); handleSendButtonAction();}">
                    </div>

                    <button class="aqua-btn" id="chat-send-btn" style="height: 40px; padding: 0 18px; font-size: 13.5px;" onclick="handleSendButtonAction()">Gönder ➤</button>
                </div>
            </main>

            <!-- SAĞ SÜTUN -->
            <div></div>
        `;
    }

    chatBgInput = document.getElementById('chat-bg-input');
    chatCustomBg = document.getElementById('chat-custom-bg');
    resetChatBgBtn = document.getElementById('reset-chat-bg-btn');

    initEmojiPicker();
    initChatGlobalEvents();
})();

// 2. INDEX.HTML İLE SENKRONİZASYON KANCALARI
function onChatViewActivated() {
    sortFriendsForChat();
    renderChatLeftList();
    fetchMyGroups();
    if (!activeChatPartner && !activeChatGroup && myFriendsList.length > 0) {
        selectChatFriend(myFriendsList[0].user_id);
    } else if (activeChatPartner) {
        markConversationRead(activeChatPartner.user_id);
        loadConversationMessages(false, false);
    } else if (activeChatGroup) {
        loadConversationMessages(false, false);
    }
}

function resetChatStateOnLogout() {
    closeCreateGroupModal();
    clearInterval(chatPollInterval);
    activeChatPartner = null;
    activeChatGroup = null;
    currentChatMessages = [];
    conversationMemoryCache.clear();
    lastRenderedChatSignature = '';
    applyChatBackgroundToDOM(null);
}

// 3. EMOJİ VE GIF MOTORU
function initEmojiPicker() {
    const tabsEl = document.getElementById('emoji-cat-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = EMOJI_CATEGORIES.map(cat => `
        <div class="emoji-cat-tab ${cat.id === activeEmojiCatId ? 'active' : ''}" id="emoji-tab-${cat.id}" title="${cat.title}" onclick="selectEmojiCategory('${cat.id}')">
            ${cat.icon}
        </div>
    `).join('');

    EMOJI_CATEGORIES.forEach(cat => {
        emojiCategoryHtmlCache[cat.id] = cat.emojis.map(em => `<div class="emoji-item" data-emoji="${em}">${em}</div>`).join('');
    });

    const gridEl = document.getElementById('emoji-grid');
    gridEl.addEventListener('click', (e) => {
        const item = e.target.closest('.emoji-item');
        if (item && item.dataset.emoji) {
            insertEmoji(item.dataset.emoji);
        }
    });

    renderEmojiCategoryGrid();
}

function selectEmojiCategory(catId) {
    activeEmojiCatId = catId;
    document.getElementById('emoji-search-filter').value = '';
    EMOJI_CATEGORIES.forEach(cat => {
        const tab = document.getElementById(`emoji-tab-${cat.id}`);
        if (tab) tab.classList.toggle('active', cat.id === catId);
    });
    const foundCat = EMOJI_CATEGORIES.find(c => c.id === catId);
    if (foundCat) document.getElementById('emoji-cat-title').textContent = foundCat.title;
    renderEmojiCategoryGrid();
}

function renderEmojiCategoryGrid() {
    const gridEl = document.getElementById('emoji-grid');
    if (!gridEl) return;
    const filterText = (document.getElementById('emoji-search-filter').value || '').trim().toLowerCase();

    if (filterText) {
        const matchingCats = EMOJI_CATEGORIES.filter(c => c.title.toLowerCase().includes(filterText) || c.id.includes(filterText));
        const list = matchingCats.length > 0
            ? matchingCats.flatMap(c => c.emojis)
            : EMOJI_CATEGORIES.flatMap(c => c.emojis);
        gridEl.innerHTML = list.map(em => `<div class="emoji-item" data-emoji="${em}">${em}</div>`).join('');
        return;
    }

    gridEl.innerHTML = emojiCategoryHtmlCache[activeEmojiCatId] || emojiCategoryHtmlCache[EMOJI_CATEGORIES[0].id];
}

async function fetchWithTimeout(url, ms = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

async function fetchGiphyGifs(query = '') {
    const cleanQuery = (query || '').trim().toLowerCase();
    const localMatches = cleanQuery
        ? FALLBACK_GIFS_DB.filter(item => item.tags.includes(cleanQuery)).map(i => i.url)
        : FALLBACK_GIFS_DB.map(i => i.url);

    if (localMatches.length > 0) {
        renderGifGridItems(localMatches);
    } else {
        document.getElementById('gif-grid').innerHTML = `<div style="grid-column: span 2; text-align:center; padding: 20px; color:#003366; font-size:12px; font-weight:800;">🔍 GIF aranıyor...</div>`;
    }

    try {
        const tenorUrl = cleanQuery
            ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(cleanQuery)}&key=LIVDSRZULELA&limit=24`
            : `https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=24`;
        const tRes = await fetchWithTimeout(tenorUrl, 2200);
        if (tRes.ok) {
            const tJson = await tRes.json();
            const urls = (tJson.results || []).map(item =>
                item.media?.[0]?.tinygif?.url || item.media?.[0]?.gif?.url
            ).filter(Boolean);
            if (urls.length > 0) {
                renderGifGridItems(urls);
                return;
            }
        }
    } catch (e) {}

    try {
        const bRes = await fetchWithTimeout(`${API_URL}/chat/gifs?q=${encodeURIComponent(cleanQuery)}`, 2200);
        if (bRes.ok) {
            const bData = await bRes.json();
            if (bData.gifs && bData.gifs.length > 0) {
                renderGifGridItems(bData.gifs);
                return;
            }
        }
    } catch (e) {}

    renderGifGridItems(localMatches.length > 0 ? localMatches : FALLBACK_GIFS_DB.map(i => i.url));
}

function renderGifGridItems(urls) {
    const gifGrid = document.getElementById('gif-grid');
    if (!urls || urls.length === 0) {
        gifGrid.innerHTML = `<div style="grid-column: span 2; text-align:center; padding: 20px; color:#003366; font-size:12px; font-weight:800;">Aramana uygun GIF bulunamadı.</div>`;
        return;
    }
    gifGrid.innerHTML = urls.map(url =>
        `<img src="${url}" class="gif-item" loading="lazy" decoding="async" onclick="sendGifMessage('${url}')" alt="GIF">`
    ).join('');
}

function onGiphySearchInput() {
    clearTimeout(giphySearchTimeout);
    const q = document.getElementById('giphy-search-input').value.trim();
    giphySearchTimeout = setTimeout(() => {
        fetchGiphyGifs(q);
    }, 250);
}

// 4. SOHBET SEKMELERİ, ARAMA VE SIRALAMA
function switchChatListTab(tabMode) {
    activeChatTab = tabMode;
    document.getElementById('tab-btn-direct').classList.toggle('active', tabMode === 'direct');
    document.getElementById('tab-btn-groups').classList.toggle('active', tabMode === 'groups');
    const searchInput = document.getElementById('chat-friend-search-input');
    searchInput.value = '';
    searchInput.placeholder = tabMode === 'direct' ? 'Kullanıcı adı ara...' : 'Grup adı ara...';
    renderChatLeftList();
    if (tabMode === 'groups') {
        fetchMyGroups();
    }
}

function onLeftSearchInput() {
    clearTimeout(leftSearchDebounceTimer);
    leftSearchDebounceTimer = setTimeout(() => {
        renderChatLeftList();
    }, 80);
}

function onChatSearchInput() {
    clearTimeout(chatSearchDebounceTimer);
    chatSearchDebounceTimer = setTimeout(() => {
        renderChatMessages(false, true);
    }, 90);
}

function applyChatBackgroundToDOM(url) {
    if (!chatCustomBg || !resetChatBgBtn) return;
    if (url) {
        chatCustomBg.style.backgroundImage = `url('${url}')`;
        resetChatBgBtn.style.display = 'inline-flex';
    } else {
        chatCustomBg.style.backgroundImage = 'none';
        resetChatBgBtn.style.display = 'none';
    }
}

function sortFriendsForChat() {
    myFriendsList.sort((a, b) => {
        const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
        return (a.display_name || '').localeCompare(b.display_name || '');
    });
}

function bumpFriendToTopOfChatList(friendUserId, timestampIso) {
    const friendObj = myFriendsList.find(f => f.user_id === friendUserId);
    if (!friendObj) return;
    friendObj.last_message_at = timestampIso || new Date().toISOString();
    sortFriendsForChat();
    lastAnimatedTopFriendId = friendUserId;
    renderChatLeftList();
    setTimeout(() => { lastAnimatedTopFriendId = null; }, 500);
}

function bumpGroupToTopOfChatList(groupId, timestampIso) {
    const grp = myGroupsList.find(g => Number(g.id) === Number(groupId));
    if (!grp) return;
    grp.last_message_at = timestampIso || new Date().toISOString();
    myGroupsList.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
    lastAnimatedTopFriendId = `group-${groupId}`;
    renderChatLeftList();
    setTimeout(() => { lastAnimatedTopFriendId = null; }, 500);
}

function updateTotalUnreadBadge() {
    const badge = document.getElementById('chat-unread-badge');
    if (!badge) return;
    const totalUnread = myFriendsList.reduce((acc, f) => acc + (Number(f.unread_count) || 0), 0);
    if (totalUnread > 0) {
        badge.style.display = 'flex';
        badge.textContent = totalUnread;
    } else {
        badge.style.display = 'none';
    }
}

async function markConversationRead(friendUserId) {
    if (!currentUser || !friendUserId) return;
    const fObj = myFriendsList.find(f => f.user_id === friendUserId);
    if (fObj && fObj.unread_count > 0) {
        fObj.unread_count = 0;
        updateTotalUnreadBadge();
        renderChatLeftList();
    }
    fetch(`${API_URL}/chat/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readerId: currentUser.id, senderId: friendUserId })
    }).catch(() => {});
}

// 5. GRUP YÖNETİMİ
async function fetchMyGroups() {
    if (!currentUser) {
        myGroupsList = [];
        return;
    }
    if (isFetchingGroups) return;
    isFetchingGroups = true;
    try {
        const res = await fetch(`${API_URL}/chat/groups/${currentUser.id}`);
        if (!res.ok) return;
        myGroupsList = await res.json();
        saveLocalUserCache(currentUser.id, { groups: myGroupsList });
        if (activeChatTab === 'groups') {
            renderChatLeftList();
        }
    } catch (e) {} finally {
        isFetchingGroups = false;
    }
}

function openCreateGroupModal() {
    if (!currentUser) {
        showToast("⚠️ Grup oluşturmak için önce giriş yapmalısın!");
        return;
    }
    document.getElementById('new-group-name-input').value = '';
    const pickList = document.getElementById('group-friends-pick-list');
    if (myFriendsList.length === 0) {
        pickList.innerHTML = `<p style="color:#003366; font-size:12px; font-weight:800; text-align:center; padding:12px;">Gruba eklemek için önce arkadaş edinmelisin.</p>`;
    } else {
        pickList.innerHTML = myFriendsList.map(f => `
            <label class="group-friend-pick-row">
                <input type="checkbox" class="group-member-checkbox" value="${f.user_id}">
                <img src="${f.avatar_url}" alt="Avatar" loading="lazy" decoding="async">
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(f.display_name)}</span>
            </label>
        `).join('');
    }
    document.getElementById('create-group-modal').style.display = 'flex';
}

function closeCreateGroupModal() {
    const modal = document.getElementById('create-group-modal');
    if (modal) modal.style.display = 'none';
}

async function handleCreateGroup() {
    if (!currentUser) return;
    const nameInput = document.getElementById('new-group-name-input');
    const groupName = nameInput.value.trim();
    if (!groupName) {
        showToast("⚠️ Lütfen bir grup adı yazın!");
        return;
    }
    const checkedBoxes = Array.from(document.querySelectorAll('.group-member-checkbox:checked'));
    const memberIds = checkedBoxes.map(cb => cb.value);

    const btn = document.getElementById('submit-create-group-btn');
    btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/chat/groups/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: groupName,
                creatorId: currentUser.id,
                memberIds
            })
        });
        const result = await res.json();
        if (res.ok && result.group) {
            showToast("🎉 Grup başarıyla oluşturuldu!");
            closeCreateGroupModal();
            await fetchMyGroups();
            switchChatListTab('groups');
            selectChatGroup(result.group.id);
        } else {
            showToast("⚠️ " + (result.error || "Grup oluşturulamadı."));
        }
    } catch (e) {
        showToast("⚠️ Sunucu hatası.");
    } finally {
        btn.disabled = false;
    }
}

// 6. SOL LİSTE VE AKTİF KONUŞMA SEÇİMİ
function renderChatLeftList() {
    const container = document.getElementById('chat-friends-list');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = '<p class="aero-text" style="font-size:12px; text-align:center;">Önce giriş yapın.</p>';
        return;
    }

    const searchVal = (document.getElementById('chat-friend-search-input')?.value || '').trim().toLowerCase();

    if (activeChatTab === 'groups') {
        if (myGroupsList.length === 0) {
            container.innerHTML = '<p class="aero-text" style="font-size:12px; text-align:center; padding-top:15px;">Henüz bir grubun yok.<br>Sağ üstteki "➕ Grup Oluştur" tuşuyla hemen kurabilirsin!</p>';
            return;
        }
        const filteredGroups = searchVal
            ? myGroupsList.filter(g => (g.name || '').toLowerCase().includes(searchVal))
            : myGroupsList;

        if (filteredGroups.length === 0) {
            container.innerHTML = `<p class="aero-text" style="font-size:12px; text-align:center; padding-top:15px;">"${escapeHtml(searchVal)}" adına sahip grup bulunamadı.</p>`;
            return;
        }

        container.innerHTML = filteredGroups.map(g => {
            const isSelected = activeChatGroup && Number(activeChatGroup.id) === Number(g.id);
            const isBumped = lastAnimatedTopFriendId === `group-${g.id}`;
            return `
                <div class="user-row ${isSelected ? 'active-chat-friend' : ''} ${isBumped ? 'bumped-to-top' : ''}" style="cursor:pointer;" onclick="selectChatGroup(${g.id})">
                    <div class="avatar-wrap">
                        <img src="${g.avatar_url || 'https://api.dicebear.com/9.x/shapes/svg?seed=Group'}" loading="lazy" decoding="async">
                    </div>
                    <div class="user-meta">
                        <span class="user-name aero-text">👥 ${escapeHtml(g.name)}</span>
                        <span class="user-status aero-text">${g.member_count || 1} Üye</span>
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    if (myFriendsList.length === 0) {
        container.innerHTML = '<p class="aero-text" style="font-size:12px; text-align:center; padding-top:15px;">Mesajlaşmak için önce arkadaş eklemelisin.</p>';
        return;
    }

    const filteredFriends = searchVal
        ? myFriendsList.filter(f => (f.display_name || '').toLowerCase().includes(searchVal))
        : myFriendsList;

    if (filteredFriends.length === 0) {
        container.innerHTML = `<p class="aero-text" style="font-size:12px; text-align:center; padding-top:15px;">"${escapeHtml(searchVal)}" adına sahip arkadaş bulunamadı.</p>`;
        return;
    }

    container.innerHTML = filteredFriends.map(f => {
        const isSelected = activeChatPartner && activeChatPartner.user_id === f.user_id;
        const isBumped = lastAnimatedTopFriendId === f.user_id;
        const statusText = f.is_online ? `<span class="inline-orb"></span> Çevrimiçi` : 'Çevrimdışı';
        const avatarStatus = f.is_online ? '<span class="orb-sm"></span>' : '';
        const unreadHtml = f.unread_count > 0 ? `<span class="unread-pill">${f.unread_count}</span>` : '';
        return `
            <div class="user-row ${isSelected ? 'active-chat-friend' : ''} ${isBumped ? 'bumped-to-top' : ''}" style="cursor:pointer;" onclick="selectChatFriend('${f.user_id}')">
                <div class="avatar-wrap">
                    <img src="${f.avatar_url}" loading="lazy" decoding="async">
                    ${avatarStatus}
                </div>
                <div class="user-meta">
                    <span class="user-name aero-text">${escapeHtml(f.display_name)}</span>
                    <span class="user-status aero-text">${statusText}</span>
                </div>
                ${unreadHtml}
            </div>
        `;
    }).join('');
}

function getActiveConversationCacheKey() {
    if (activeChatGroup) return `group_${activeChatGroup.id}`;
    if (activeChatPartner) return `direct_${activeChatPartner.user_id}`;
    return null;
}

function selectChatFriend(friendUserId) {
    const friendObj = myFriendsList.find(f => f.user_id === friendUserId);
    if (!friendObj) return;
    activeChatGroup = null;
    activeChatPartner = friendObj;
    closePinnedDropdown();
    markConversationRead(friendUserId);
    renderChatLeftList();

    const avatarWrap = document.getElementById('chat-partner-avatar-wrap');
    const avatarImg = document.getElementById('chat-partner-avatar');
    avatarWrap.style.display = 'block';
    avatarWrap.onclick = () => window.location.href = `/user/${friendObj.profile_id}`;
    avatarImg.src = friendObj.avatar_url;

    document.getElementById('chat-partner-name').textContent = friendObj.display_name;
    document.getElementById('chat-partner-status').innerHTML = friendObj.is_online ? '🟢 Çevrimiçi' : 'Çevrimdışı';

    const cacheKey = getActiveConversationCacheKey();
    lastRenderedChatSignature = '';
    if (conversationMemoryCache.has(cacheKey)) {
        currentChatMessages = conversationMemoryCache.get(cacheKey);
        renderChatMessages(true, true);
    } else {
        currentChatMessages = [];
        document.getElementById('chat-messages-list').innerHTML = `<div style="margin:auto; text-align:center;"><p class="aero-text" style="font-size:13px;">Mesajlar yükleniyor... ⏳</p></div>`;
    }

    loadConversationMessages(true, true);
    startChatPolling();
}

function selectChatGroup(groupId) {
    const grpObj = myGroupsList.find(g => Number(g.id) === Number(groupId));
    if (!grpObj) return;
    activeChatPartner = null;
    activeChatGroup = grpObj;
    closePinnedDropdown();
    renderChatLeftList();

    const avatarWrap = document.getElementById('chat-partner-avatar-wrap');
    const avatarImg = document.getElementById('chat-partner-avatar');
    avatarWrap.style.display = 'block';
    avatarWrap.onclick = null;
    avatarImg.src = grpObj.avatar_url || 'https://api.dicebear.com/9.x/shapes/svg?seed=Group';

    document.getElementById('chat-partner-name').textContent = `👥 ${grpObj.name}`;
    document.getElementById('chat-partner-status').textContent = `Grup Sohbeti • ${grpObj.member_count || 1} Üye`;

    const cacheKey = getActiveConversationCacheKey();
    lastRenderedChatSignature = '';
    if (conversationMemoryCache.has(cacheKey)) {
        currentChatMessages = conversationMemoryCache.get(cacheKey);
        renderChatMessages(true, true);
    } else {
        currentChatMessages = [];
        document.getElementById('chat-messages-list').innerHTML = `<div style="margin:auto; text-align:center;"><p class="aero-text" style="font-size:13px;">Grup mesajları yükleniyor... ⏳</p></div>`;
    }

    loadConversationMessages(true, true);
    startChatPolling();
}

function startChatPolling() {
    clearInterval(chatPollInterval);
    chatPollInterval = setInterval(() => {
        if (!document.hidden && activeMainView === 'chat' && (activeChatPartner || activeChatGroup)) {
            loadConversationMessages(false, false);
        }
    }, 3500);
}

// 7. MESAJLARI YÜKLEME, AKILLI RENDER VE SABİTLEME
async function loadConversationMessages(scrollToBottom = false, forceCancelPrevious = false) {
    if (!currentUser || (!activeChatPartner && !activeChatGroup)) return;
    if (isFetchingChat && !forceCancelPrevious) return;

    if (forceCancelPrevious && activeChatAbortController) {
        activeChatAbortController.abort();
    }

    activeChatAbortController = new AbortController();
    const expectedKey = getActiveConversationCacheKey();
    isFetchingChat = true;

    try {
        let url = '';
        if (activeChatGroup) {
            url = `${API_URL}/chat/group-messages?groupId=${encodeURIComponent(activeChatGroup.id)}`;
        } else {
            url = `${API_URL}/chat/messages?user1=${encodeURIComponent(currentUser.id)}&user2=${encodeURIComponent(activeChatPartner.user_id)}`;
        }

        const res = await fetch(url, { signal: activeChatAbortController.signal });
        if (!res.ok) return;
        const data = await res.json();

        if (getActiveConversationCacheKey() !== expectedKey) return;

        const prevLastRealMsg = [...currentChatMessages].reverse().find(m => !String(m.id).startsWith('temp-'));
        const prevLastId = prevLastRealMsg ? prevLastRealMsg.id : null;

        const pendingOptimistic = currentChatMessages.filter(m => String(m.id).startsWith('temp-'));
        currentChatMessages = [...(data || []), ...pendingOptimistic];
        conversationMemoryCache.set(expectedKey, data || []);

        const newLastMsg = data && data.length > 0 ? data[data.length - 1] : null;

        if (newLastMsg && prevLastId !== null && newLastMsg.id !== prevLastId) {
            if (activeChatGroup) {
                bumpGroupToTopOfChatList(activeChatGroup.id, newLastMsg.created_at);
            } else if (activeChatPartner) {
                bumpFriendToTopOfChatList(activeChatPartner.user_id, newLastMsg.created_at);
                if (activeMainView === 'chat') {
                    markConversationRead(activeChatPartner.user_id);
                }
            }
        }

        renderChatMessages(scrollToBottom || (newLastMsg && newLastMsg.id !== prevLastId), false);
    } catch (e) {
    } finally {
        isFetchingChat = false;
    }
}

function buildSingleMessageHtml(msg) {
    const isMine = msg.sender_id === currentUser.id;
    const timeStr = new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    let attachmentHtml = '';

    if (msg.attachment_url) {
        const type = msg.attachment_type || '';
        if (type === 'gif' || type.startsWith('image/')) {
            attachmentHtml = `<img src="${msg.attachment_url}" class="msg-media-img" loading="lazy" decoding="async" onclick="window.open('${msg.attachment_url}', '_blank')" alt="GIF/Medya">`;
        } else if (type.startsWith('audio/')) {
            attachmentHtml = `
                <div style="margin-top:4px;">
                    <div style="font-size:11px; margin-bottom:2px;">🎤 ${escapeHtml(msg.attachment_name || 'Sesli Mesaj')}</div>
                    <audio controls preload="metadata" class="msg-audio-player" src="${msg.attachment_url}"></audio>
                </div>
            `;
        }
    }

    const senderTitleHtml = (activeChatGroup && !isMine && msg.sender_name)
        ? `<div class="msg-sender-label">👤 ${escapeHtml(msg.sender_name)}</div>`
        : '';

    const isTemp = String(msg.id).startsWith('temp-');
    const pinBtnHtml = isTemp
        ? `<span style="font-size:10px; opacity:0.75;">Gönderiliyor...</span>`
        : `<button class="pin-action-btn" onclick="togglePinMessage(${msg.id}, ${!msg.is_pinned})" title="${msg.is_pinned ? 'Sabitlemeyi Kaldır' : 'Mesajı Sabitle'}">${msg.is_pinned ? 'Sabiti Kaldır' : '📌 Sabitle'}</button>`;

    return `
        <div class="msg-row ${isMine ? 'mine' : 'theirs'}" id="chat-msg-${msg.id}">
            <div class="msg-bubble">
                ${senderTitleHtml}
                ${msg.content ? `<div class="msg-text">${escapeHtml(msg.content)}</div>` : ''}
                ${attachmentHtml}
                <div class="msg-meta-bar">
                    <span>${timeStr}</span>
                    ${msg.is_pinned ? '<span title="Sabitlenmiş Mesaj">📌</span>' : ''}
                    ${pinBtnHtml}
                </div>
            </div>
        </div>
    `;
}

function renderChatMessages(scrollBottom = false, forceRender = false) {
    const listEl = document.getElementById('chat-messages-list');
    if (!listEl) return;
    const searchVal = (document.getElementById('chat-search-input').value || '').trim().toLowerCase();

    let filtered = currentChatMessages;
    if (searchVal) {
        filtered = currentChatMessages.filter(m =>
            (m.content && m.content.toLowerCase().includes(searchVal)) ||
            (m.attachment_name && m.attachment_name.toLowerCase().includes(searchVal))
        );
    }

    const currentSignature = `${getActiveConversationCacheKey()}|${searchVal}|` +
        filtered.map(m => `${m.id}:${m.is_pinned ? 1 : 0}`).join(',');

    if (!forceRender && currentSignature === lastRenderedChatSignature) {
        if (scrollBottom) listEl.scrollTop = listEl.scrollHeight;
        return;
    }
    lastRenderedChatSignature = currentSignature;

    const pinnedMsgs = currentChatMessages.filter(m => m.is_pinned);
    document.getElementById('pinned-count-badge').textContent = pinnedMsgs.length;
    renderPinnedDropdownList(pinnedMsgs);

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="margin:auto; text-align:center;"><p class="aero-text" style="font-size:13.5px;">${searchVal ? 'Aramana uygun mesaj bulunamadı.' : 'Henüz mesaj yok. İlk mesajı sen gönder! 👋'}</p></div>`;
        return;
    }

    listEl.innerHTML = filtered.map(buildSingleMessageHtml).join('');

    if (scrollBottom) {
        listEl.scrollTop = listEl.scrollHeight;
    }
}

function togglePinnedDropdown(e) {
    e.stopPropagation();
    const pop = document.getElementById('pinned-dropdown-popover');
    pop.style.display = pop.style.display === 'flex' ? 'none' : 'flex';
}

function closePinnedDropdown() {
    const pop = document.getElementById('pinned-dropdown-popover');
    if (pop) pop.style.display = 'none';
}

function renderPinnedDropdownList(pinnedMsgs) {
    const container = document.getElementById('pinned-list-scroll');
    if (!container) return;
    if (!pinnedMsgs || pinnedMsgs.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:14px; color:#003366; font-size:12px; font-weight:800;">Bu sohbette henüz sabitlenmiş mesaj yok.</div>`;
        return;
    }
    container.innerHTML = [...pinnedMsgs].reverse().map(m => {
        const label = m.content || (m.attachment_type === 'gif' ? '🎬 GIF Animasyonu' : `🎤 ${m.attachment_name || 'Sesli Mesaj'}`);
        const timeStr = new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="pinned-list-item" onclick="jumpToChatMessage(${m.id})">
                <div class="pinned-list-item-content" title="${escapeHtml(label)}">
                    📌 ${escapeHtml(label)}
                    <div style="font-size:10px; color:#026aa7; font-weight:700;">Saat: ${timeStr} • Gitmek için tıkla</div>
                </div>
                <button class="pin-action-btn" onclick="event.stopPropagation(); togglePinMessage(${m.id}, false)" title="Sabitlemeyi Kaldır">Kaldır</button>
            </div>
        `;
    }).join('');
}

function jumpToChatMessage(msgId) {
    closePinnedDropdown();
    const searchInput = document.getElementById('chat-search-input');
    if (searchInput.value) {
        searchInput.value = '';
        renderChatMessages(false, true);
    }
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-jump');
        el.style.transform = 'scale(1.04)';
        setTimeout(() => {
            el.style.transform = '';
            el.classList.remove('highlight-jump');
        }, 1400);
    }
}

async function togglePinMessage(msgId, pinState) {
    const targetMsg = currentChatMessages.find(m => Number(m.id) === Number(msgId));
    if (targetMsg) {
        targetMsg.is_pinned = Boolean(pinState);
        renderChatMessages(false, true);
    }
    showToast(pinState ? "📌 Mesaj sabitlenenlere eklendi!" : "📌 Sabitleme kaldırıldı.");

    try {
        await fetch(`${API_URL}/chat/pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: msgId, isPinned: pinState })
        });
    } catch (e) {}
}

// 8. AÇILIR PENCERELER, SES KAYDI, MESAJ GÖNDERİMİ VE ARKA PLAN
function toggleEmojiPopover(e) {
    e.stopPropagation();
    const emPop = document.getElementById('emoji-popover');
    const gifPop = document.getElementById('gif-popover');
    gifPop.style.display = 'none';
    emPop.style.display = emPop.style.display === 'flex' ? 'none' : 'flex';
}

function toggleGifPopover(e) {
    e.stopPropagation();
    const emPop = document.getElementById('emoji-popover');
    const gifPop = document.getElementById('gif-popover');
    emPop.style.display = 'none';
    if (gifPop.style.display === 'flex') {
        gifPop.style.display = 'none';
    } else {
        gifPop.style.display = 'flex';
        const q = document.getElementById('giphy-search-input').value.trim();
        fetchGiphyGifs(q);
    }
}

function closeChatPopovers() {
    const emPop = document.getElementById('emoji-popover');
    const gifPop = document.getElementById('gif-popover');
    if (emPop) emPop.style.display = 'none';
    if (gifPop) gifPop.style.display = 'none';
}

function initChatGlobalEvents() {
    document.addEventListener('click', (e) => {
        const composerBar = document.getElementById('chat-composer-bar');
        const topBar = document.getElementById('chat-top-bar');
        if (composerBar && !composerBar.contains(e.target)) {
            closeChatPopovers();
        }
        if (topBar && !topBar.contains(e.target)) {
            closePinnedDropdown();
        }
    });

    if (chatBgInput) {
        chatBgInput.addEventListener('change', async function() {
            const file = this.files[0];
            this.value = '';
            if (!file || !currentUser) return;

            if (file.size > 10 * 1024 * 1024) {
                showToast("⚠️ Sohbet arka planı (Resim/GIF) maksimum 10 MB olabilir!");
                return;
            }

            showToast("⏳ Sohbet arka planı yükleniyor...");
            const formData = new FormData();
            formData.append('chatBg', file);
            formData.append('userId', currentUser.id);

            try {
                const res = await fetch(`${API_URL}/chat/background`, { method: 'POST', body: formData });
                const result = await res.json();
                if (res.ok && result.chatBgUrl) {
                    applyChatBackgroundToDOM(result.chatBgUrl);
                    saveLocalUserCache(currentUser.id, { chatBgUrl: result.chatBgUrl });
                    showToast("🖼️ Sohbet arka planın güncellendi!");
                } else {
                    showToast("⚠️ " + (result.error || "Arka plan yüklenemedi."));
                }
            } catch (e) {
                showToast("⚠️ Sunucu hatası.");
            }
        });
    }
}

function insertEmoji(emojiChar) {
    const input = document.getElementById('chat-msg-input');
    input.value += emojiChar;
    input.focus();
}

async function sendGifMessage(gifUrl) {
    if (!currentUser || (!activeChatPartner && !activeChatGroup)) {
        showToast("⚠️ Önce soldan bir arkadaş veya grup seçmelisin!");
        return;
    }
    closeChatPopovers();
    await sendChatPayload({
        content: '',
        attachmentUrl: gifUrl,
        attachmentName: 'animasyon.gif',
        attachmentType: 'gif',
        attachmentSize: 0
    });
}

async function toggleVoiceRecording() {
    if (!currentUser || (!activeChatPartner && !activeChatGroup)) {
        showToast("⚠️ Önce soldan bir arkadaş veya grup seçmelisin!");
        return;
    }
    if (isRecordingVoice) {
        finishAndSendVoiceRecording();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.start();
        isRecordingVoice = true;
        voiceRecSeconds = 0;

        document.getElementById('voice-record-btn').classList.add('recording-active');
        document.getElementById('voice-recording-bar').style.display = 'flex';
        document.getElementById('voice-rec-timer').textContent = 'Ses kaydediliyor... 00:00';

        clearInterval(voiceRecInterval);
        voiceRecInterval = setInterval(() => {
            voiceRecSeconds++;
            document.getElementById('voice-rec-timer').textContent = `Ses kaydediliyor... ${formatSeconds(voiceRecSeconds)}`;
        }, 1000);
    } catch (err) {
        showToast("⚠️ Mikrofon izni verilmedi veya mikrofon bulunamadı.");
    }
}

function cancelVoiceRecording() {
    if (!mediaRecorder) return;
    clearInterval(voiceRecInterval);
    isRecordingVoice = false;
    document.getElementById('voice-record-btn').classList.remove('recording-active');
    document.getElementById('voice-recording-bar').style.display = 'none';
    try {
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    } catch (e) {}
    mediaRecorder = null;
    audioChunks = [];
}

function finishAndSendVoiceRecording() {
    if (!mediaRecorder || !isRecordingVoice) return;
    clearInterval(voiceRecInterval);
    isRecordingVoice = false;
    document.getElementById('voice-record-btn').classList.remove('recording-active');
    document.getElementById('voice-recording-bar').style.display = 'none';

    mediaRecorder.onstop = async () => {
        try {
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (audioBlob.size < 200) return;

            showToast("⏳ Sesli mesaj gönderiliyor...");
            const formData = new FormData();
            formData.append('voice', audioBlob, 'sesli_mesaj.webm');
            formData.append('senderId', currentUser.id);

            const upRes = await fetch(`${API_URL}/chat/upload-voice`, {
                method: 'POST',
                body: formData
            });
            const upData = await upRes.json();
            if (!upRes.ok || !upData.publicUrl) {
                showToast("⚠️ " + (upData.error || "Sesli mesaj yüklenemedi."));
                return;
            }

            await sendChatPayload({
                content: '',
                attachmentUrl: upData.publicUrl,
                attachmentKey: upData.fileKey,
                attachmentName: 'Sesli Mesaj',
                attachmentType: 'audio/webm',
                attachmentSize: upData.fileSize || audioBlob.size
            });
            showToast("🎤 Sesli mesaj gönderildi!");
        } catch (err) {
            showToast("⚠️ Sesli mesaj gönderilirken hata oluştu.");
        }
    };
    mediaRecorder.stop();
}

function handleSendButtonAction() {
    if (!currentUser || (!activeChatPartner && !activeChatGroup)) {
        showToast("⚠️ Önce soldan mesajlaşmak istediğin arkadaşını veya grubu seç!");
        return;
    }

    const input = document.getElementById('chat-msg-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.focus();
    sendChatPayload({ content: text });
}

async function sendChatPayload(payload) {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const targetGroupId = activeChatGroup ? activeChatGroup.id : null;
    const targetReceiverId = activeChatGroup ? null : activeChatPartner?.user_id;
    const cacheKey = getActiveConversationCacheKey();

    const optimisticMsg = {
        id: tempId,
        sender_id: currentUser.id,
        receiver_id: targetReceiverId,
        group_id: targetGroupId,
        sender_name: currentDisplayName || 'Sen',
        content: payload.content || '',
        attachment_url: payload.attachmentUrl || null,
        attachment_name: payload.attachmentName || null,
        attachment_type: payload.attachmentType || null,
        is_pinned: false,
        created_at: nowIso
    };

    currentChatMessages.push(optimisticMsg);
    renderChatMessages(true, false);

    if (targetGroupId) {
        bumpGroupToTopOfChatList(targetGroupId, nowIso);
    } else if (targetReceiverId) {
        bumpFriendToTopOfChatList(targetReceiverId, nowIso);
    }

    try {
        const bodyObj = {
            senderId: currentUser.id,
            receiverId: targetReceiverId,
            groupId: targetGroupId,
            ...payload
        };
        const res = await fetch(`${API_URL}/chat/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyObj)
        });
        const result = await res.json();
        if (!res.ok) {
            currentChatMessages = currentChatMessages.filter(m => m.id !== tempId);
            renderChatMessages(false, true);
            showToast("⚠️ " + (result.error || "Gönderilemedi."));
            return;
        }
        if (result.message) {
            const idx = currentChatMessages.findIndex(m => m.id === tempId);
            if (idx !== -1) {
                currentChatMessages[idx] = {
                    ...result.message,
                    sender_name: currentDisplayName || 'Sen'
                };
                if (cacheKey) {
                    conversationMemoryCache.set(cacheKey, currentChatMessages.filter(m => !String(m.id).startsWith('temp-')));
                }
                renderChatMessages(false, false);
            }
        }
    } catch (e) {
        currentChatMessages = currentChatMessages.filter(m => m.id !== tempId);
        renderChatMessages(false, true);
        showToast("⚠️ Sunucu hatası.");
    }
}

function triggerChatBgUpload() {
    if (!currentUser || !chatBgInput) return;
    chatBgInput.click();
}

async function resetChatBg() {
    if (!currentUser) return;
    applyChatBackgroundToDOM(null);
    saveLocalUserCache(currentUser.id, { chatBgUrl: null });
    showToast("🗑️ Sohbet arka planı kaldırıldı.");
    try {
        await fetch(`${API_URL}/chat/background/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
    } catch (e) {}
}