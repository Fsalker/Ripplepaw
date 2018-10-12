const fs = require("fs")
const log = require("./log.js").log
const crypto = require("crypto")

// My functions!! :D
const generateHash = require("./utils.js").generateHash
const query = require("./utils.js").query

// Configurable, more or less
const BANNED_FRONTEND_CHARACTERS_REGEX = /[^a-zA-Z0-9]/
const BANNED_FRONTEND_CHARACTERS_ALLOW_SPACES_REGEX = /[^a-zA-Z0-9 ]/
const ALLOWED_ROOM_LANGUAGES = "english romanian".split(" ")

// Quite useful functions
function validate_auth(con, userId, hash){
    //console.log("hash = "+hash)
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
        if(data.boardWidth < 2 || data.boardWidth > 10) throw "bad board width"
        if(data.boardHeight < 2 || data.boardHeight > 10) throw "bad board height"
        if(ALLOWED_ROOM_LANGUAGES.indexOf(data.language) == -1) throw "bad language"

        r = await query(con, "INSERT INTO Rooms(ownerId, name, maxplayers, boardWidth, boardHeight, password, language) VALUES (?,?,?,?,?,?,?); SELECT LAST_INSERT_ID()",
            [data.userId, data.name, data.maxplayers, data.boardWidth, data.boardHeight, data.password, data.language])
        roomId = r[1][0]["LAST_INSERT_ID()"]

        // Assign Words
        words = await query(con, "SELECT id FROM Words WHERE language = ? ORDER BY RAND() LIMIT ?", [data.language, data.boardWidth * data.boardHeight])

        let numBlueCards = parseInt(words.length * 0.32);
        let numRedCards = numBlueCards;
        let numBlackCards = 1;
        let numGrayCards = words.length - numBlueCards - numRedCards - numBlackCards

        if(words.length != numBlueCards + numRedCards + numBlackCards + numGrayCards) throw "invalid amount of cards lol"

        let wordsToRoom = words.map( (word, index) => {
            let wordId = word["id"]
            let color;
            let position = index / words.length // the word's position from 1 to 25 (default) in % => ie: index 5 => position 20%

            if(numBlueCards){
                color = "Blue"
                --numBlueCards
            }
            else if(numRedCards){
                color = "Red"
                --numRedCards
            }
            else if(numBlackCards){
                color = "Black"
                --numBlackCards
            }
            else if(numGrayCards){
                color = "Gray"
                --numGrayCards
            }

            return [wordId, roomId, color]
        })
        if(numBlueCards || numRedCards || numBlackCards || numGrayCards) throw "There still are cards to fill in..."

        await query(con, "INSERT INTO WordToRoom(wordId, roomId, color) VALUES ?", [wordsToRoom])

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

    // userId, hash, roomId, _password
    // -> 200 / 500 / 403 (if the user is banned from joining this room, they get a 403)
    joinRoom: async(con, res, data) => {
        validate_input(data, ["userId", "hash", "roomId"])
        await validate_auth(con, data.userId, data.hash)

        roomPassword = (await query(con, "SELECT password FROM Rooms WHERE id = ?", data.roomId))[0]["password"]
        if(roomPassword != "" && roomPassword != data.password){
            res.writeHead(401)
            return res.end("bad password")
        }

        remainingSlots = (await query(con, "SELECT (SELECT maxplayers FROM Rooms WHERE id = ?) - COUNT(*) as `remainingSlots` FROM UserToRoom WHERE roomId = ?", [data.roomId, data.roomId]))[0]["remainingSlots"]
        if(remainingSlots <= 0) throw "room is full"

        r = await query(con, "SELECT banned FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId])
        if(r.length > 0 && r[0]["banned"] == 'true'){
            res.writeHead(403)
            return res.end("banned")
        }

        r = await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId])
        if(r[0]["COUNT(*)"] > 0) return res.end()

        await query(con, "INSERT INTO UserToRoom(userId, roomId) VALUES (?,?)", [data.userId, data.roomId])

        res.end()
    },

    // userId, hash, roomId
    // -> 200 / 500
    leaveRoom: async(con, res, data) => {
        validate_input(data, ["userId", "hash", "roomId"])
        await validate_auth(con, data.userId, data.hash)

        r = await query(con, "DELETE FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId])
        let roomOwnerId = (await query(con, "SELECT ownerId FROM Rooms WHERE id = ?", data.roomId))[0]["ownerId"]
        if(data.userId == roomOwnerId) { // Room owner leaves the room, so we pass the ownership to someone else. If there's no one, kill the lobby! :D
            if((await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE roomId = ?", data.roomId))[0]["COUNT(*)"] > 0){ // Pass the ownership
                let newOwnerId = (await query(con, "SELECT userId FROM UserToRoom WHERE roomId = ? LIMIT 1", data.roomId))[0]["userId"]
                await query(con, "UPDATE Rooms SET ownerId = ? WHERE id = ?", [newOwnerId, data.roomId])
            }
            else { // Destroy the room
                await query(con, "UPDATE Rooms SET closed='true' WHERE id = ?", data.roomId)
            }
        }

        res.end()
    },

    // userId, hash
    // -> [{roomId, roomName}]
    getJoinedRooms: async(con, res, data) => {
        validate_input(data, ["userId", "hash"])
        await validate_auth(con, data.userId, data.hash)

        rooms = await query(con, "SELECT a.id, a.name FROM Rooms a JOIN UserToRoom b ON a.id = b.roomId WHERE b.userId = ?", data.userId)
        res.end(JSON.stringify(rooms))
    },

    // userId, hash, roomId, targetUserId
    kick: async(con, res, data) => {
        validate_input(data, "userId hash roomId targetUserId".split(" "))
        await validate_auth(con, data.userId, data.hash)
        if((await query(con, "SELECT ownerId FROM Rooms WHERE id=?", data.roomId))[0]["ownerId"] != data.userId) throw "user isn't the room's owner!"

        await query(con, "DELETE FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId])
        res.end()
    },

    // userId, hash, roomId, targetUserId
    ban: async(con, res, data) => {
        validate_input(data, "userId hash roomId targetUserId".split(" "))
        await validate_auth(con, data.userId, data.hash)
        if((await query(con, "SELECT ownerId FROM Rooms WHERE id=?", data.roomId))[0]["ownerId"] != data.userId) throw "user isn't the room's owner!"

        await query(con, `DELETE FROM UserToRoom WHERE userId = ? AND roomId = ?;
                          INSERT INTO UserToRoom(userId, roomId, banned) VALUES(?, ?, 'true')`, [data.userId, data.roomId, data.userId, data.roomId])
        res.end()
    },

    // userId, hash, roomId, targetUserId
    passOwnership: async(con, res, data) => {
        validate_input(data, "userId hash roomId targetUserId".split(" "))
        await validate_auth(con, data.userId, data.hash)
        if((await query(con, "SELECT ownerId FROM Rooms WHERE id=?", data.roomId))[0]["ownerId"] != data.userId) throw "user isn't the room's owner!"

        await query(con, "UPDATE Rooms SET ownerId = ? WHERE id = ?", [data.targetUserId, data.userId])
        res.end()
    }
}