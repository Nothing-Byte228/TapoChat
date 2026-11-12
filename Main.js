import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import Store from 'electron-store';
import { exec } from 'child_process';
import fs from 'fs';

const FileName = fileURLToPath(import.meta.url);
const DirName = path.dirname(FileName);

dotenv.config({
    path: path.join(DirName, 'Config', '.env')
});

import { supabase } from './Assets/Scripts/Supabase.js';

let win;
let splash;

const store = new Store();

let currentNotification;

function EnableMessages() {
    supabase
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            const msg = payload.new;
            
            if (win && !win.isDestroyed()) {
                win.webContents.send('new-message-received', msg);
                
                const saved = store.get('SavedAccount');
                // Исправляем поле на то, которое реально сохраняется в store (например, displayname)
                const currentName = saved ? (saved.displayname || saved.username) : '';

                // Сравниваем автора сообщения с вашим реальным именем
                if (msg.author !== currentName) {
                    currentNotification = new Notification({
                        title: `${msg.author}`,
                        body: msg.text,
                        silent: true
                    });

                    currentNotification.show();

                    currentNotification.on('click', () => {
                        if (win) {
                            if (win.isMinimized()) win.restore();
                            win.focus();
                        }
                    });
                }
            }
        })
        .subscribe();
}

async function CreateClientWindow() {
    try {
        splash = new BrowserWindow({
            width: 300,
            height: 400,
            transparent: false, 
            frame: false,      
            alwaysOnTop: true, 
            resizable: false,
            center: true,
            autoHideMenuBar: true
        });
    
        win = new BrowserWindow({
            title: 'TapoChat',
            width: 1280,
            height: 720,
            autoHideMenuBar: true,
            show: false,
            webPreferences: {
                preload: path.join(DirName, 'Preload.cjs'),
                nodeIntegration: false,
                contextIsolation: true
            }
        });
    
        splash.loadURL(path.join(DirName, 'Src', 'Loading.html'))
    
        if (!store.has('SavedAccount')) {
            splash.destroy()
            win.show()
            win.loadURL(path.join(DirName, 'Src', 'Login.html'));
        } else {
            const saved = store.get('SavedAccount');
            const accountUuid = await GetUserUUID(saved.username, saved.password);
    
            if (!accountUuid) {
                splash.destroy()
                win.show()
                win.loadURL(path.join(DirName, 'Src', 'Login.html'));
            } else {
                const isBanned = await IsBanned(accountUuid);
                
                if (isBanned === true || isBanned === null) {
                    splash.destroy()
                    win.show()
                    win.loadURL(path.join(DirName, 'Src', 'Login.html'));
                } else {
                    splash.destroy()
                    win.show()
                    win.loadURL(path.join(DirName, 'Src', 'Chat.html'));
                    EnableMessages()
                }
            }
        }
    } catch (error) {
        console.log('Error:', error)
    }
}

app.on('ready', async () => { await CreateClientWindow(); startUpdateChecker() });
app.setAppUserModelId('TapoChat'); 

function hashPassword(password) {
    const salt = process.env.PASSWORD_SALT || 'default_salt';
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

async function GetUserUUID(username, password) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('uuid, password')
            .eq('username', username)
            .single();

        if (error || !data) {
            console.log('Пользователь не найден');
            return null;
        }

        const hashedPasswordInput = hashPassword(password);

        if (data.password === hashedPasswordInput) {
            return data.uuid;
        } else {
            console.log('Неверный пароль');
            return null;
        }
    } catch (err) {
        console.error('Ошибка:', err.message);
        return null;
    }
}

async function IsBanned(userUuid) {
    try {
        if (!userUuid) {
            console.log('В функцию IsBanned не передан UUID');
            return null;
        }

        const { data, error } = await supabase
            .from('users')
            .select('is_banned')
            .eq('uuid', userUuid)
            .single();

        if (error || !data) {
            console.log('Пользователь не найден в БД или ошибка:', error?.message);
            return null;
        }

        return data.is_banned;
    } catch (err) {
        console.error('Критическая ошибка в IsBanned:', err.message);
        return null;
    }
}

async function QueryRegister(username, displayname, password) {
    if (!username || !password || !displayname || username.trim() === '') {
        console.log('Пользователь не передал данные для регистрации.');
        return { success: false, error: 'Пользователь не передал данные для регистрации.' };
    }

    try {
        const hashedPassword = hashPassword(password);

        const { data, error } = await supabase
            .from('users')
            .insert([
                { 
                    username: username.trim(), 
                    displayname: displayname.trim(),
                    password: hashedPassword,
                    is_banned: false 
                }
            ])
            .select('uuid')
            .single();

        if (error) {
            console.error('Ошибка при создании пользователя:', error.message);
            if (error.code === '23505') {
                return { success: false, error: 'Этот никнейм уже занят другими пользователями.' };
            }
            return { success: false, error: 'Не удалось создать аккаунт. Попробуйте другой ник.' };
        }

        store.set('SavedAccount', { 
            username: username.trim(), 
            displayname: displayname.trim(),
            password: password 
        });

        win.loadURL(path.join(DirName, 'Src', 'Chat.html'));
        EnableMessages()
        return { success: true };
    } catch (err) {
        console.error('Критическая ошибка регистрации:', err.message);
        return { success: false, error: 'Внутренняя ошибка приложения.' };
    }
}

async function QueryLogin(username, password) {
    if (!username || !password) {
        console.log('Пользователь не передел данные для входа.')
        return false;
    }

    const uuid = await GetUserUUID(username, password);
    if (!uuid) return false;

    const isBanned = await IsBanned(uuid);

    if (isBanned === null || isBanned === true) {
        console.log('Данный пользователь забанен или не найден.')
        return false;
    } else {
        const { data } = await supabase
            .from('users')
            .select('displayname')
            .eq('uuid', uuid)
            .single();

        win.loadURL(path.join(DirName, 'Src', 'Chat.html'));

        store.set('SavedAccount', { 
            username: username,
            displayname: data.displayname, 
            password: password
        });
        EnableMessages()
        return true;
    }
}

function ForceLogout() {
    console.log("Принудительный выход из аккаунта.");
    store.delete('SavedAccount');
    win.loadURL(path.join(DirName, 'Src', 'Login.html'));
}

ipcMain.handle('check-current-ban-status', async () => {
    if (!store.has('SavedAccount')) {
        ForceLogout();
        return true;
    }

    const saved = store.get('SavedAccount');
    const accountUuid = await GetUserUUID(saved.username, saved.password);
    
    if (!accountUuid) {
        ForceLogout();
        return true;
    }

    const isBanned = await IsBanned(accountUuid);
    if (isBanned === true || isBanned === null) {
        ForceLogout();
        return true;
    }

    return false;
});

async function SendMessage(text, replyUuid) {
    try {
        const safeReplyUuid = (!replyUuid || replyUuid.trim() === '') ? null : replyUuid;

        const { data: msg, error } = await supabase
            .from('messages')
            .insert([
                {
                    author: store.get('SavedAccount').displayname,
                    text: text,
                    reply_uuid: safeReplyUuid
                }
            ])
            .select('uuid, author, text, reply_uuid, timestamp')
            .single();
        
        if (error) throw error;

        let replyHtml = '';
        if (safeReplyUuid) {
            const { data: replyMsg } = await supabase
                .from('messages')
                .select('author, text')
                .eq('uuid', safeReplyUuid)
                .single();

            if (replyMsg) {
                replyHtml = `
                    <div class="msg-reply">
                        <h5>${replyMsg.author}</h5>
                        <p style="color: #ffffffcc; font-size: 10pt;">${replyMsg.text}</p>
                    </div>
                `;
            }
        }

        const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="msg-my" data-uuid="${msg.uuid}">
                <h4>${msg.author}</h4>
                ${replyHtml}
                <p style="color: #ffffffcc;">${msg.text}</p>
                <span>${timeString}</span>
            </div>
        `;
    } catch (error) {
        console.log(`Ошибка отправки сообщения: ${error.message || error}`);
        return null;
    }
}

async function LoadAllMessages() {
    try {
        const account = store.get('SavedAccount');
        const currentDisplayname = account ? account.displayname : '';

        const { data: messages, error } = await supabase
            .from('messages')
            .select('uuid, author, text, reply_uuid, timestamp')
            .order('timestamp', { ascending: true })
            .limit(100);

        if (error) throw error;
        if (!messages || messages.length === 0) return '';

        const messageMap = new Map();
        messages.forEach(msg => messageMap.set(msg.uuid, msg));

        let htmlResult = '';

        messages.forEach(msg => {
            const authorName = msg.author || 'Аноним';
            const isMyMessage = (authorName === currentDisplayname);
            const messageClass = isMyMessage ? 'msg-my' : 'msg-other';

            let replyHtml = '';
            if (msg.reply_uuid && messageMap.has(msg.reply_uuid)) {
                const replyMsg = messageMap.get(msg.reply_uuid);
                replyHtml = `
                    <div class="msg-reply">
                        <h5>${replyMsg.author}</h5>
                        <p style="color: #ffffffcc; font-size: 10pt;">${replyMsg.text}</p>
                    </div>
                `;
            }

            const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // 🌟 ОБЯЗАТЕЛЬНО должен быть атрибут data-uuid="${msg.uuid}"
            htmlResult += `
                <div class="${messageClass}" data-uuid="${msg.uuid}">
                    <h4>${authorName}</h4>
                    ${replyHtml}
                    <p style="color: #ffffffcc;">${msg.text}</p>
                    <span>${timeString}</span>
                </div>
            `;
        });

        return htmlResult;
    } catch (error) {
        console.log(`Ошибка загрузки истории чата: ${error.message || error}`);
        return '<p style="color: red;">Не удалось загрузить историю сообщений.</p>';
    }
}

function QueryLogout() {
    win.loadURL(path.join(DirName, 'Src', 'Login.html'))
    store.delete('SavedAccount');
}

function PlayNotification() {
    const audio = new Audio('../Assets/Sounds/notification.mp3');
    audio.volume = 0.4;
    audio.play().catch((e) => {
        console.log(`Ошибка воспроизведения звука: ${e}`)
    });
}

// Проверка обновлений каждые 30 секунд легковесным способом (через raw package.json на GitHub)
function startUpdateChecker() {
    setInterval(async () => {
        try {
            const response = await fetch('https://api.github.com/repos/Nothing-Byte228/TapoChat/contents/package.json');
            if (!response.ok) return;
            const remotePkg = await response.json();
            
            // Читаем локальный package.json
            const localPkgPath = path.join(DirName, 'package.json');
            if (fs.existsSync(localPkgPath)) {
                const localPkg = JSON.parse(fs.readFileSync(localPkgPath, 'utf8'));

                // Сравниваем версии (например, "1.0.0" vs "1.1.0")
                if (remotePkg.version !== localPkg.version) {
                    if (win && !win.isDestroyed()) {
                        // Отправляем сигнал в рендерер, что есть обновление
                        win.webContents.send('update-available', remotePkg.version);
                    }
                }
            }
        } catch (err) {
            console.log('Ошибка при проверке обновлений:', err);
        }
    }, 5000); // 5 секунд
}

// IPC-слушатель для запуска скрипта обновления из интерфейса
ipcMain.handle('run-updater', () => {
    const scriptPath = path.join(DirName, 'update.ps1');
    if (fs.existsSync(scriptPath)) {
        // Запускаем PowerShell со скриптом и закрываем приложение, чтобы файлы не были заняты
        exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, (error) => {
            if (error) {
                console.error(`Ошибка запуска обновлятора: ${error}`);
            }
        });
        setTimeout(() => {
            app.quit();
        }, 1000);
    }
});

ipcMain.handle('get-displayname', async () => { const account = store.get('SavedAccount'); return account ? account.displayname : '' });
ipcMain.handle('load-all-messages', async () => await LoadAllMessages());
ipcMain.handle('query-register', async (event, username, displayname, password) => await QueryRegister(username, displayname, password));
ipcMain.handle('query-login', async (event, username, password) => await QueryLogin(username, password));
ipcMain.handle('query-logout', () => QueryLogout());
ipcMain.handle('send-message', async (event, text, replyUuid) => await SendMessage(text, replyUuid));
ipcMain.handle('play-notification', () => PlayNotification())