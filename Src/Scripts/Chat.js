let currentReplyUuid = null;
let isSending = false;
let unreadCount = 0;
let isWindowFocused = true;
let myDisplayname = "";

window.addEventListener('focus', () => {
    isWindowFocused = true;
    unreadCount = 0;
    document.title = "TapoChat";
});

window.addEventListener('blur', () => {
    isWindowFocused = false;
});

function autoResizeTextArea(element) {
    element.style.height = "24px"; 
    const newHeight = element.scrollHeight;
    if (newHeight > 48) element.style.height = Math.min(newHeight, 192) + "px"; 
}

let activeContextMenu = null;

// Плавное закрытие активного меню
function closeActiveMenu() {
    if (!activeContextMenu) return;
    const menu = activeContextMenu;
    activeContextMenu = null;
    menu.classList.add('closing');
    setTimeout(() => {
        menu.remove();
    }, 120); // Время должно совпадать с длительностью анимации menuOut в CSS
}

// Закрытие при клике в любое место
document.addEventListener('click', (e) => {
    if (activeContextMenu && !activeContextMenu.contains(e.target)) {
        closeActiveMenu();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const msgContainer = document.getElementById('msg-container');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const previewContainer = document.getElementById('reply-preview-container');
    const previewAuthor = document.getElementById('reply-preview-author');
    const previewText = document.getElementById('reply-preview-text');

    myDisplayname = await window.System.GetDisplayname();

    if (cancelReplyBtn && previewContainer) {
        cancelReplyBtn.addEventListener('click', () => {
            currentReplyUuid = null;
            previewContainer.style.display = 'none';
        });
    }

    // Делегирование правого клика
    document.addEventListener('contextmenu', (e) => {
        const messageEl = e.target.closest('.msg-my, .msg-other');
        if (!messageEl) return;

        e.preventDefault();

        if (activeContextMenu) {
            closeActiveMenu();
        }

        const uuid = messageEl.getAttribute('data-uuid');
        const author = messageEl.querySelector('h4')?.textContent || 'Аноним';
        const text = messageEl.querySelector('p')?.textContent || '';

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <button class="reply-action">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                Ответить
            </button>
            <button class="reply-action">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pen preview-icon"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
                Изменить
            </button>
            <button class="reply-action">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy preview-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                Копировать
            </button>
            <button class="reply-action">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-delete preview-icon"><path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/></svg>
                Удалить
            </button>
        `;

        menu.style.top = `${e.pageY}px`;
        menu.style.left = `${e.pageX}px`;

        // Обработка кнопки "Ответить"
        menu.querySelector('.reply-action').addEventListener('click', () => {
            currentReplyUuid = uuid;
            
            if (previewContainer && previewAuthor && previewText) {
                previewAuthor.textContent = author;
                previewText.textContent = text;
                previewContainer.style.display = 'flex';
            }

            if (input) input.focus();
            closeActiveMenu();
        });

        document.body.appendChild(menu);
        activeContextMenu = menu;
    });

    function checkIfAtBottom() {
        return msgContainer.scrollHeight - msgContainer.scrollTop <= msgContainer.clientHeight + 100;
    }

    function scrollToBottom() {
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    async function sendMessage() {
        if (isSending) return;
        const text = input.value.trim();
        if (!text) return;

        isSending = true;

        try {
            const messageHtml = await window.System.SendMessage(text, currentReplyUuid);

            if (messageHtml) {
                msgContainer.insertAdjacentHTML('beforeend', messageHtml);
                
                input.value = '';
                input.style.height = '24px';
                currentReplyUuid = null;
                if (previewContainer) previewContainer.style.display = 'none';

                scrollToBottom();
            }
        } catch (error) {
            console.error('Ошибка при отправке сообщения:', error);
        } finally {
            isSending = false;
        }
    }

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Обработка входящих сообщений в реальном времени
    window.System.OnNewMessage((msg) => {
        if (msg.author === myDisplayname) return;

        const wasAtBottom = checkIfAtBottom();
        const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const html = `
            <div class="msg-other" data-uuid="${msg.uuid}">
                <h4>${msg.author}</h4>
                <p style="color: #ffffffcc; word-break: break-word; white-space: pre-wrap;">${msg.text}</p>
                <span>${timeString}</span>
            </div>
        `;

        msgContainer.insertAdjacentHTML('beforeend', html);

        if (wasAtBottom) {
            scrollToBottom();
        }

        const audio = new Audio('../Assets/Sounds/notification.mp3');
        audio.volume = 0.4;
        audio.play().catch((e) => {console.log(`Ошибка воспроизведения звука: ${e}`)});

        if (!isWindowFocused) {
            unreadCount++;
            document.title = `(${unreadCount}) TapoChat`;
        }
    });

    // --- СИСТЕМА ОБНОВЛЕНИЙ ---
    // Создаем элемент баннера динамически или ищем готовый в HTML
    let updateBanner = document.getElementById('update-banner');
    if (!updateBanner) {
        updateBanner = document.createElement('div');
        updateBanner.id = 'update-banner';
        updateBanner.innerHTML = `
            <span>Доступна новая версия TapoChat!</span>
            <button id="start-update-btn">Обновить</button>
        `;
        // Вставляем баннер сразу под шапку (#header)
        const header = document.getElementById('header');
        if (header) {
            header.insertAdjacentElement('afterend', updateBanner);
        }
    }

    // Слушаем сигнал от main.js о наличии обновления
    window.System.OnUpdateAvailable?.((newVersion) => {
        updateBanner.style.display = 'flex';

        // Проигрываем специальный звук обновления
        try {
            const updateAudio = new Audio('../Assets/Sounds/Update_Available.mp3');
            updateAudio.volume = 0.5;
            updateAudio.play().catch((e) => console.log('Звук обновления заблокирован браузером:', e));
        } catch (e) {
            console.log('Ошибка воспроизведения звука обновления:', e);
        }
    });

    // Обработка клика по кнопке обновления
    document.getElementById('start-update-btn')?.addEventListener('click', async () => {
        updateBanner.innerHTML = `<span>Скачивание и установка обновления...</span>`;
        await window.System.RunUpdater();
    });
});