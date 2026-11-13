let currentDisplayname = '';
let currentReplyUuid = null;

// Элементы интерфейса
const msgContainer = document.getElementById('msg-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserLabel = document.getElementById('current-user-label');

// Элементы ответа (Reply)
const replyPreviewContainer = document.getElementById('reply-preview-container');
const replyPreviewAuthor = document.getElementById('reply-preview-author');
const replyPreviewText = document.getElementById('reply-preview-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

// Элементы обновления и прогресс-бара Win 11
const updateBanner = document.getElementById('update-banner');
const updateBannerText = document.getElementById('update-banner-text');
const btnStartUpdate = document.getElementById('btn-start-update');
const progressContainer = document.getElementById('update-progress-container');
const progressFill = document.getElementById('update-pb-fill');
const percentText = document.getElementById('update-percent-text');
const statusText = document.getElementById('update-status-text');

// Инициализация при загрузке окна
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Проверяем статус бана
    const isBanned = await window.System.CheckBanStatus();
    if (isBanned) return;

    // 2. Получаем имя текущего пользователя
    currentDisplayname = await window.System.GetDisplayname();
    currentUserLabel.textContent = `Вы вошли как: ${currentDisplayname}`;

    // 3. Загружаем историю сообщений
    const historyHtml = await window.System.LoadAllMessages();
    msgContainer.innerHTML = historyHtml;
    scrollToBottom();
});

// Автопрокрутка вниз
function scrollToBottom() {
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

// Форматирование времени
function formatTime(isoString) {
    const date = isoString ? new Date(isoString) : new Date();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Отправка сообщения
async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    messageInput.value = '';
    messageInput.style.height = 'auto';

    const replyUuidToSend = currentReplyUuid;
    clearReply();

    const newMsgHtml = await window.System.SendMessage(text, replyUuidToSend);
    if (newMsgHtml) {
        msgContainer.insertAdjacentHTML('beforeend', newMsgHtml);
        scrollToBottom();
    }
}

sendBtn.addEventListener('click', handleSendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});

// Авто-высота поля ввода
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});

// Функция воспроизведения звука (проверьте, чтобы путь к mp3 был правильным относительно Src/Chat.js)
function PlayNotification() {
    try {
        const audio = new Audio('../Assets/Sounds/Notification.mp3');
        audio.volume = 0.4;
        audio.play().catch((e) => {
            console.log(`Ошибка воспроизведения звука: ${e}`);
        });
    } catch (err) {
        console.log(`Не удалось запустить звук: ${err}`);
    }
}

// Получение новых сообщений в реальном времени
window.System.OnNewMessage((msg) => {
    // Игнорируем свои сообщения
    if (msg.author === currentDisplayname) return;

    // 🔊 ВОТ ЗДЕСЬ ОБЯЗАТЕЛЬНО ДОЛЖЕН БЫТЬ ВЫЗОВ ЗВУКА:
    PlayNotification();

    // Проверяем, нет ли уже такого сообщения в DOM
    if (document.querySelector(`[data-uuid="${msg.uuid}"]`)) return;

    let replyHtml = '';
    if (msg.reply_uuid) {
        const targetMsgEl = document.querySelector(`[data-uuid="${msg.reply_uuid}"]`);
        if (targetMsgEl) {
            const rAuthor = targetMsgEl.querySelector('h4')?.textContent || 'Сообщение';
            const rText = targetMsgEl.querySelector('p')?.textContent || '';
            replyHtml = `
                <div class="msg-reply">
                    <h5>${rAuthor}</h5>
                    <p style="color: #ffffffcc; font-size: 10pt;">${rText}</p>
                </div>
            `;
        }
    }

    const msgHtml = `
        <div class="msg-other" data-uuid="${msg.uuid}">
            <h4>${msg.author || 'Аноним'}</h4>
            ${replyHtml}
            <p style="color: #ffffffcc;">${msg.text}</p>
            <span>${formatTime(msg.timestamp)}</span>
        </div>
    `;

    msgContainer.insertAdjacentHTML('beforeend', msgHtml);
    scrollToBottom();
});

// Контекстное меню для ответа и копирования
msgContainer.addEventListener('contextmenu', (e) => {
    const msgEl = e.target.closest('.msg-my, .msg-other');
    if (!msgEl) return;

    e.preventDefault();
    removeExistingContextMenus();

    const uuid = msgEl.getAttribute('data-uuid');
    const author = msgEl.querySelector('h4')?.textContent || '';
    const text = msgEl.querySelector('p')?.textContent || '';

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${Math.min(e.pageX, window.innerWidth - 170)}px`;
    menu.style.top = `${Math.min(e.pageY, window.innerHeight - 100)}px`;

    const replyOption = document.createElement('button');
    replyOption.textContent = 'Ответить';
    replyOption.onclick = () => {
        setReply(uuid, author, text);
        removeExistingContextMenus();
    };

    const copyOption = document.createElement('button');
    copyOption.textContent = 'Копировать текст';
    copyOption.onclick = () => {
        navigator.clipboard.writeText(text);
        removeExistingContextMenus();
    };

    menu.appendChild(replyOption);
    menu.appendChild(copyOption);
    document.body.appendChild(menu);
});

function removeExistingContextMenus() {
    document.querySelectorAll('.context-menu').forEach(menu => {
        menu.classList.add('closing');
        setTimeout(() => menu.remove(), 120);
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) {
        removeExistingContextMenus();
    }
});

// Управление превью ответа
function setReply(uuid, author, text) {
    currentReplyUuid = uuid;
    replyPreviewAuthor.textContent = `Ответ для ${author}`;
    replyPreviewText.textContent = text;
    replyPreviewContainer.style.display = 'flex';
    messageInput.focus();
}

function clearReply() {
    currentReplyUuid = null;
    replyPreviewContainer.style.display = 'none';
}

cancelReplyBtn.addEventListener('click', clearReply);

// Выход из аккаунта
logoutBtn.addEventListener('click', () => {
    window.System.QueryLogout();
});

// --- ЛОГИКА ОБНОВЛЕНИЯ И ПРОГРЕСС-БАРА WINDOWS 11 ---

// Слушаем уведомление о доступности новой версии от Main.js
window.System.OnUpdateAvailable((newVersion) => {
    window.System.PlayNotification();
    updateBannerText.textContent = `Доступно обновление TapoChat v${newVersion}`;
    updateBanner.style.display = 'flex';
});

// Запуск обновления при нажатии на кнопку
btnStartUpdate.addEventListener('click', async () => {
    updateBanner.style.display = 'none';
    progressContainer.style.display = 'flex';

    let progress = 0;
    statusText.textContent = 'Скачивание архива с GitHub...';
    progressFill.style.width = '0%';
    percentText.textContent = '0%';

    // Плавное заполнение прогресс-бара до 92% во время работы PowerShell
    const timer = setInterval(() => {
        if (progress < 40) {
            progress += 8;
        } else if (progress < 75) {
            progress += 4;
            statusText.textContent = 'Распаковка и замена файлов...';
        } else if (progress < 92) {
            progress += 1;
            statusText.textContent = 'Подготовка к перезапуску...';
        }
        progressFill.style.width = `${progress}%`;
        percentText.textContent = `${progress}%`;
    }, 120);

    try {
        await window.System.RunUpdater();
        clearInterval(timer);
        progressFill.style.width = '100%';
        percentText.textContent = '100%';
        statusText.textContent = 'Обновление завершено! Перезапуск...';
    } catch (err) {
        clearInterval(timer);
        statusText.textContent = 'Ошибка при запуске обновления';
        console.error(err);
    }
});