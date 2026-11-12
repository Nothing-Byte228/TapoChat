const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('System', {
    QueryLogin: (username, password) => ipcRenderer.invoke('query-login', username, password),
    QueryRegister: (username, displayname, password) => ipcRenderer.invoke('query-register', username, displayname, password),
    CheckBanStatus: () => ipcRenderer.invoke('check-current-ban-status'),
    SendMessage: (text, replyUuid) => ipcRenderer.invoke('send-message', text, replyUuid),
    LoadAllMessages: () => ipcRenderer.invoke('load-all-messages'),
    QueryLogout: () => ipcRenderer.invoke('query-logout'),
    OnNewMessage: (callback) => ipcRenderer.on('new-message-received', (event, msg) => callback(msg)),
    GetDisplayname: () => ipcRenderer.invoke('get-displayname'),
    PlayNotification: () => ipcRenderer.invoke('play-notification'),
    OnUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, version) => callback(version)),
    RunUpdater: () => ipcRenderer.invoke('run-updater')
})