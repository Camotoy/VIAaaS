let urlParams = new URLSearchParams();
window.location.hash.substr(1).split("?").map(it => new URLSearchParams(it).forEach((a, b) => urlParams.append(b, a)));
var username = urlParams.get("username");
var mcauth_code = urlParams.get("mcauth_code");
if (urlParams.get("mcauth_success") == "false") {
    alert("Couldn't authenticate with Minecraft.ID: " + urlParams.get("mcauth_msg"));
}

function defaultWs() {
    return window.location.host == "viaversion.github.io" || !window.location.host ? "wss://localhost:25543/ws" : "wss://" + window.location.host + "/ws";
}

function getWsUrl() {
    let url = localStorage.getItem("ws-url") || defaultWs();
    localStorage.setItem("ws-url", url);
    return url;
}

var wsUrl = getWsUrl();

var socket = null;
var connectionStatus = document.getElementById("connection_status");
var corsStatus = document.getElementById("cors_status");
var listening = document.getElementById("listening");
var actions = document.getElementById("actions");
var accounts = document.getElementById("accounts-list");
var listenVisible = false;

isSuccess = status => status >= 200 && status < 300;

function getCorsProxy() {
    return localStorage.getItem("cors-proxy") || "https://crp123-cors.herokuapp.com/";
}

function refreshCorsStatus() {
    corsStatus.innerText = "...";
    icanhazip(true)
        .then(ip => {
            return icanhazip(false).then(ip2 => {
                corsStatus.innerText = "OK " + ip + (ip != ip2 ? " (different IP)" : "");
            });
        })
        .catch(e => {
            corsStatus.innerText = "error: " + e;
        });
}

function icanhazip(cors) {
    return fetch((cors ? getCorsProxy() : "") + "https://ipv4.icanhazip.com")
        .then(it => {
             if (!isSuccess(it.status)) throw "not success " + it.status
             return it.text();
        }).then(it => it.trim());
}

function setCorsProxy(url) {
    localStorage.setItem("cors-proxy", url);
    refreshCorsStatus();
}

refreshCorsStatus();

function loginMc(user, pass) {
    var clientToken = uuid.v4();
    fetch(getCorsProxy() + "https://authserver.mojang.com/authenticate", {
        method: "post",
        body: JSON.stringify({
            agent: {name: "Minecraft", version: 1},
            username: user,
            password: pass,
            clientToken: clientToken,
        }),
        headers: {"content-type": "application/json"}
    }).then((data) => {
        if (!isSuccess(data.status)) throw "not success " + data.status;
        return data.json();
    }).then((data) => {
        storeMcAccount(data.accessToken, data.clientToken, data.selectedProfile.name, data.selectedProfile.id);
    }).catch((e) => alert("Failed to login: " + e));
    $("#email").val("");
    $("#password").val("");
}

function storeMcAccount(accessToken, clientToken, name, id, msUser = null) {
    let accounts = JSON.parse(localStorage.getItem("mc_accounts")) || [];
    let account = {accessToken: accessToken, clientToken: clientToken, name: name, id: id, msUser: msUser};
    accounts.push(account);
    localStorage.setItem("mc_accounts", JSON.stringify(accounts));
    refreshAccountList();
    return account;
}

function removeMcAccount(id) {
    let accounts = JSON.parse(localStorage.getItem("mc_accounts")) || [];
    accounts = accounts.filter(it => it.id != id);
    localStorage.setItem("mc_accounts", JSON.stringify(accounts));
    refreshAccountList();
}

isMojang = it => !!it.clientToken;
isNotMojang = it => !it.clientToken;

function getMcAccounts() {
    return JSON.parse(localStorage.getItem("mc_accounts")) || [];
}

function findAccountByMs(username) {
    return getMcAccounts().filter(isNotMojang).find(it => it.msUser == username);
}

function logoutMojang(id) {
    getMcAccounts().filter(isMojang).filter(it => it.id == id).forEach(it => {
        fetch(getCorsProxy() + "https://authserver.mojang.com/invalidate", {method: "post",
            body: JSON.stringify({
                accessToken: it.accessToken,
                clientToken: it.clientToken
            }),
            headers: {"content-type": "application/json"},
        }).then((data) => {
            if (!isSuccess(data.status)) throw "not success logout " + data.status;
            removeMcAccount(id);
        }).catch((e) => {
            if (confirm("failed to invalidate token! error: " + e + " remove account?")) {
                removeMcAccount(id);
            }
        });
    });
}

function addMcAccountToList(id, name, msUser = null) {
    let p = document.createElement("p");
    let head = document.createElement("img");
    let n = document.createElement("span");
    let remove = document.createElement("a");
    n.innerText = " " + name + " " + (msUser == null ? "" : "(" + msUser + ") ");
    remove.innerText = "Logout";
    remove.href = "#";
    remove.onclick = () => {
        if (msUser == null) {
            logoutMojang(id);
        } else {
            logoutMs(msUser);
        }
    };
    head.className = "account_head";
    head.alt = name + "'s head";
    head.src = "https://crafthead.net/helm/" + id;
    p.append(head);
    p.append(n);
    p.append(remove);
    accounts.appendChild(p);
}

function refreshAccountList() {
    accounts.innerHTML = "";
    getMcAccounts().filter(isMojang).forEach(it => addMcAccountToList(it.id, it.name));
    (myMSALObj.getAllAccounts() || []).forEach(msAccount => {
        let mcAcc = findAccountByMs(msAccount.username) || {id: "MHF_Question", name: "..."};
        addMcAccountToList(mcAcc.id, mcAcc.name, msAccount.username);
    });
}

function validateToken(account) {
    return fetch(getCorsProxy() + "https://authserver.mojang.com/validate", {method: "post",
        body: JSON.stringify({
            accessToken: account.accessToken,
            clientToken: account.clientToken || undefined
        }),
        headers: {"content-type": "application/json"}
    });
}

function joinGame(token, id, hash) {
    return fetch(getCorsProxy() + "https://sessionserver.mojang.com/session/minecraft/join", {
        method: "post",
        body: JSON.stringify({
            accessToken: token,
            selectedProfile: id,
            serverId: hash
        }),
        headers: {"content-type": "application/json"}
    });
}

function getMcUserToken(account) {
    return validateToken(account).then((data) => {
        if (!isSuccess(data.status)) {
            if (isMojang(account)) {
                return refreshMojangAccount(account);
            } else {
                return refreshTokenMs(account.msUser);
            }
        }
        return account;
    }).catch((e) => {
        alert("failed to refresh token! " + e);
    });
}

function refreshMojangAccount(it) {
    console.log("refreshing " + it.id);
    return fetch(getCorsProxy() + "https://authserver.mojang.com/refresh", {
        method: "post",
        body: JSON.stringify({
            accessToken: it.accessToken,
            clientToken: it.clientToken
        }),
        headers: {"content-type": "application/json"},
    }).then(data => {
        if (!isSuccess(data.status)) throw "not success " + data.status;
        return data.json();
    }).then(json => {
        console.log("refreshed " + json.selectedProfile.id);
        removeMcAccount(json.selectedProfile.id);
        return storeMcAccount(json.accessToken, json.clientToken, json.selectedProfile.name, json.selectedProfile.id);
    });
}

function listen(token) {
    socket.send(JSON.stringify({"action": "listen_login_requests", "token": token}));
}

function confirmJoin(hash) {
    socket.send(JSON.stringify({action: "session_hash_response", session_hash: hash}));
}

function saveToken(token) {
    let hTokens = JSON.parse(localStorage.getItem("tokens")) || {};
    let tokens = hTokens[wsUrl] || [];
    tokens.push(token);
    hTokens[wsUrl] = tokens;
    localStorage.setItem("tokens", JSON.stringify(hTokens));
}

function removeToken(token) {
    let hTokens = JSON.parse(localStorage.getItem("tokens")) || {};
    let tokens = hTokens[wsUrl] || [];
    tokens = tokens.filter(it => it != token);
    hTokens[wsUrl] = tokens;
    localStorage.setItem("tokens", JSON.stringify(hTokens));
}

function getTokens() {
    return (JSON.parse(localStorage.getItem("tokens")) || {})[wsUrl] || [];
}

function renderActions() {
    actions.innerHTML = "";
    if (listenVisible) {
        if (username != null && mcauth_code != null) {
            addAction("Listen to " + username, () => {
                socket.send(JSON.stringify({
                    "action": "minecraft_id_login",
                    "username": username,
                    "code": mcauth_code}));
                mcauth_code = null;
            });
        }
        addAction("Listen to premium login in VIAaaS instance", () => {
            let user = prompt("Premium username (case-sensitive): ", "");
            if (!user) return;
            let callbackUrl = new URL(location.origin + location.pathname + "#username=" + encodeURIComponent(user));
            location = "https://api.minecraft.id/gateway/start/" + encodeURIComponent(user)
                + "?callback=" + encodeURIComponent(callbackUrl);
        });
        addAction("Listen to offline login in VIAaaS instance", () => {
            let user = prompt("Offline username (case-sensitive):", "");
            if (!user) return;
            socket.send(JSON.stringify({"action": "offline_login", "username": user}));
        });
    }
}

function addAction(text, onClick) {
    let p = document.createElement("p");
    let link = document.createElement("a");
    p.appendChild(link);
    link.innerText = text;
    link.href = "#";
    link.onclick = onClick;
    actions.appendChild(p);
}

function findAccountByMcName(name) {
    return getMcAccounts().reverse().find(it => it.name.toLowerCase() == name.toLowerCase());
}

function onSocketMsg(event) {
    console.log(event.data.toString());
    let parsed = JSON.parse(event.data);
    if (parsed.action == "ad_minecraft_id_login") {
        listenVisible = true;
        renderActions();
    } else if (parsed.action == "login_result") {
        if (!parsed.success) {
            alert("VIAaaS instance couldn't verify Minecraft account");
        } else {
            listen(parsed.token);
            saveToken(parsed.token);
        }
    } else if (parsed.action == "listen_login_requests_result") {
        if (parsed.success) {
            let msg = document.createElement("p");
            msg.innerText = "Listening to login: " + parsed.user;
            listening.appendChild(msg);
        } else {
            removeToken(parsed.token);
        }
    } else if (parsed.action == "session_hash_request") {
        if (confirm("Allow auth impersonation from VIAaaS instance? info: " + JSON.stringify(parsed))) {
            let account = findAccountByMcName(parsed.user);
            if (account) {
                getMcUserToken(account).then((data) => {
                    return joinGame(data.accessToken, data.id, parsed.session_hash);
                }).then((data) => {
                    if (!isSuccess(data.status)) throw "not success join " + data.status;
                }).finally(() => confirmJoin(parsed.session_hash))
                .catch((e) => {
                    confirmJoin(parsed.session_hash);
                    alert("Couldn't contact session server for " + parsed.user + " account in browser. error: " + e);
                });
            } else {
                alert("Couldn't find " + parsed.user + " account in browser.");
                confirmJoin(parsed.session_hash);
            }
        } else {
            confirmJoin(parsed.session_hash);
        }
    }
}

function reset() {
    listening.innerHTML = "";
    listenVisible = false;
    renderActions();
}

function connect() {
    connectionStatus.innerText = "connecting...";
    socket = new WebSocket(wsUrl);

    socket.onerror = e => {
        console.log(e);
        connectionStatus.innerText = "socket error";
        reset();
    };

    socket.onopen = () => {
        connectionStatus.innerText = "connected";
        reset();

        getTokens().forEach(listen);
    };

    socket.onclose = evt => {
        connectionStatus.innerText = "disconnected with close code " + evt.code + " and reason: " + evt.reason;
        reset();
        setTimeout(connect, 5000);
    };

    socket.onmessage = onSocketMsg;
}


$(() => {
    $("#cors-proxy").on("change", () => setCorsProxy($("#cors-proxy").val()));
    $("#cors-proxy").val(getCorsProxy());
    $("#ws-url").on("change", () => {
       localStorage.setItem("ws-url", $("#ws-url").val());
       location.reload();
    });
    $("#ws-url").val(getWsUrl());
    $("#login_submit_mc").on("click", () => loginMc($("#email").val(), $("#password").val()));
    $("#login_submit_ms").on("click", loginMs);

    refreshAccountList();

    connect();
});
