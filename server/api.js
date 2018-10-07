const fs = require("fs")
const log = require("./log.js").log
const crypto = require("crypto")
const generateHash = require("./utils.js").generateHash
const query = require("./utils.js").query
const BANNED_FRONTEND_CHARACTERS_REGEX = /[^a-zA-Z0-9]/
const BANNED_FRONTEND_CHARACTERS_ALLOW_SPACES_REGEX = /[^a-zA-Z0-9 ]/
const ALLOWED_ROOM_LANGUAGES = "english romanian".split(" ")

function validate_auth(con, userId, hash){
    return new Promise( async(resolve, reject) => {
        let err;
        r = await query(con, "SELECT COUNT(*) FROM Sessions WHERE userId = ? AND hash = ?", [userId, hash]).catch(e => err = e)
        if(err) return reject(err)
        if(r[0]["COUNT(*)"] == 0) return reject("auth invalid")
        resolve()
    })
}

function validate_not_guest(con, userId, hash){
    return new Promise( async(resolve, reject) => {
        r = await query(con, "SELECT COUNT(*) FROM Sessions WHERE userId = ? AND hash = ? AND guestMode='false'", [userId, hash])
        if(r[0]["COUNT(*)"] == 0) return reject("user is actually just a guest")
        resolve()
    })
}

function validate_input(data, expectedKeys){
    for(key of expectedKeys)
        if(data[key] == undefined)
            throw "bad input"
}

function validate_legal_frontend_string(str, allow_whitespaces = false){
    let regex = BANNED_FRONTEND_CHARACTERS_REGEX
    if(allow_whitespaces) regex = BANNED_FRONTEND_CHARACTERS_ALLOW_SPACES_REGEX
    if(str && str.match(regex)) throw "illegal frontend string: "+str
}

function validate_username(username){
    validate_legal_frontend_string(username)
    if(username.length <= 3 || username.length > 20) 
        throw "bad name: "+username
}

function createSession(con, userId){
    return new Promise( async(resolve) => {
        hash = generateHash(Math.random().toString())
        await query(con, "INSERT INTO Sessions(hash, userId) VALUES(?, ?)", [hash, userId])
        resolve(hash)
    })
}

module.exports = {
    // username, nickname, password
    // -> userId, hash
    register: async (con, res, data) => {
        validate_input(data, ["username", "nickname", "password"])

        validate_legal_frontend_string(data.username)
        validate_legal_frontend_string(data.nickname)
        if(data.username.length <= 3 || data.username.length > 20) throw "bad username"
        if(data.nickname.length <= 3 || data.nickname.length > 20) throw "bad nickname"
        data.password = generateHash(data.password)

        r = await query(con, "INSERT INTO Users(username, nickname, password_hash) VALUES(?, ?, ?); SELECT LAST_INSERT_ID()", [data.username, data.nickname, data.password])        
        userId = r[1][0]["LAST_INSERT_ID()"]
        let hash = await createSession(con, userId)
        res.end(JSON.stringify({hash: hash, userId: userId, nickname: data.nickname}))
    },

    // nickname
    // -> userId, hash
    registerGuest: async (con, res, data) => {
        validate_input(data, ["nickname"])

        validate_legal_frontend_string(data.nickname)
        if(data.nickname.length <= 3 || data.nickname.length > 20) throw "bad nickname"
        
        username = crypto.randomBytes(10).toString("hex")
        password = generateHash(crypto.randomBytes(10).toString("hex"))

        r = await query(con, "INSERT INTO Users(username, nickname, password_hash, guestMode) VALUES(?, ?, ?, 'true'); SELECT LAST_INSERT_ID()", [username, data.nickname, password])        
        userId = r[1][0]["LAST_INSERT_ID()"]
        let hash = await createSession(con, userId)
        res.end(JSON.stringify({hash: hash, userId: userId, nickname: data.nickname}))
    },

    // username, password
    // -> userId, hash
    login: async (con, res, data) => {
        validate_input(data, ["username", "password"])
        data.password = generateHash(data.password)
        r = await query(con, "SELECT COUNT(*) FROM Users WHERE username = ? AND password_hash = ?", [data.username, data.password])
        if(r[0]["COUNT(*)"] == 0) throw "invalid auth for user "+data.username

        r = (await query(con, "SELECT id, nickname FROM Users WHERE username = ?", data.username))[0]
        userId = r["id"]
        nickname = r["nickname"]
        let hash = await createSession(con, userId)
        res.end(JSON.stringify({hash: hash, userId: userId, nickname: nickname}))
    },

    /* userId, hash, _nickname, _birthDate, _location, _bio */
    changePublicInfo: async (con, res, data) => {
        validate_input(data, ["userId", "hash"])
        await validate_auth(con, data.userId, data.hash)
        await validate_not_guest(con, data)

        validate_legal_frontend_string(nickname)
        validate_legal_frontend_string(birthDate)
        validate_legal_frontend_string(location)
        if(bio.match(/[^a-zA-Z0-9.,;:'"]/)) throw "bad bio"

        let fields = []
        if(data.nickname) fields.push("nickname")
        if(data.birthDate) fields.push("birthDate")
        if(data.location) fields.push("location")
        if(data.bio) fields.push("bio")

        if(data.length == 0) return res.end()

        res.end()
    },

    // username
    // -> 200 / 500
    usernameAvailable: async (con, res, data) => {
        validate_input(data, ["username"])
        r = await query(con, "SELECT COUNT(*) FROM Users WHERE username=?", data.username)
        if(r[0]["COUNT(*)"] > 0) throw `username ${data.username} is not available`

        res.end()
    },

    // userId, hash, name, maxplayers, boardWidth, boardHeight, password, language
    // -> roomId
    createRoom: async (con, res, data) => {
        validate_input(data, "userId hash name maxplayers boardWidth boardHeight password language".split(" "))
        await validate_auth(con, data.userId, data.hash)
        await validate_legal_frontend_string(data.name, true)

        if(data.name.length > 30) throw "name is too long"
        if(data.boardWidth < 1 || data.boardWidth > 10) throw "bad board width"
        if(data.boardHeight < 1 || data.boardHeight > 10) throw "bad board height"
        if(ALLOWED_ROOM_LANGUAGES.indexOf(data.language) == -1) throw "bad language"

        r = await query(con, "INSERT INTO Rooms(ownerId, name, maxplayers, boardWidth, boardHeight, password, language) VALUES (?,?,?,?,?,?,?); SELECT LAST_INSERT_ID()",
            [data.userId, data.name, data.maxplayers, data.boardWidth, data.boardHeight, data.password, data.language])
        roomId = r[1][0]["LAST_INSERT_ID()"]

        // Assign Words

        log("Created room with id "+roomId)

        res.end(JSON.stringify({roomId: roomId}))
    },

    // -> {id, name, maxplayers, boardWidth, boardHeight, hasPassword, language}
    // and current players too!
    viewRooms: async(con, res, data) => {
        r = await query(con, `SELECT a.id, a.name, b.nickname as 'owner', (SELECT COUNT(*) FROM UserToRoom WHERE roomId = a.id) as 'players', a.maxplayers, a.boardWidth, a.boardHeight, IF(a.password='','no', 'yes') as 'hasPassword', a.language 
                        FROM Rooms a 
                        JOIN Users b ON b.id = a.ownerId 
                        WHERE a.closed = 'false'
                        ORDER BY a.ts DESC 
                        /*WHERE (SELECT COUNT(*) FROM UserToRoom b where a.id = b.roomId) > 0*/`)
        res.end(JSON.stringify(r))
    },

    // userId, hash, roomId
    // -> 200 / 500
    joinRoom: async(con, res, data) => {
        validate_input(data, ["userId", "hash", "roomId"])
        await validate_auth(con, data.userId, data.hash)

        r = await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId])
        if(r[0]["COUNT(*)"] > 0) return res.end(200)

        room = (await query(con, "SELECT * FROM Rooms WHERE id = ?", data.roomId))[0]
        words = await query(con, "SELECT id FROM Words WHERE language = ? ORDER BY RAND() LIMIT ?", [room.language, room.boardWidth * room.boardHeight])

        wordsToRoom = words.map( (word, index) => {
            let color;
            let position = index / words.length // the word's position from 1 to 25 (default) in % => ie: index 5 => position 20%
            if(position <= 0.32) color = 'red'
            else if(position <= 0.64) color

        })

        await query("INSERT INTO UserToRoom(userId, roomId) VALUES ?", [wordsToRoom])

        res.end()
    },

    // userId, hash, roomId
    // -> 200 / 500
    leaveRoom: async(con, res, data) => {
        validate_input(data, ["userId", "hash", "roomId"])
        await validate_auth(con, data.userId, data.hash)

        r = await query(con, "DELETE FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId])

        res.end()
    },
}