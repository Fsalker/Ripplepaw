const crypto = require("crypto")
const fs = require("fs")
const log = require("./log.js").log
const SALT = require("./secrets.js").salt

function query(con, sql, paramArr){
    return new Promise( (resolve, reject) => {
        con.query(sql, paramArr, (err, res) => {
            if(err) return reject(err)

            resolve(res)
        })
    })
}

function generateHash(word){
    return crypto.createHash("sha256").update(word + SALT).digest("hex")
}

function validate_auth(con, userId, hash){
    return new Promise( async(resolve, reject) => {
        r = await con.query("SELECT COUNT(*) FROM Sessions WHERE userId = ? AND hash = ?", [userId, hash])
        if(r[0]["COUNT(*)"] == 0) return reject("auth invalid")
        resolve()
    })
}

function validate_input(data, expectedKeys){
    for(key of expectedKeys)
        if(data[key] == undefined)
            throw "bad input"
}

function validate_username(username){
    if(username.match(/[^a-zA-Z0-9]/)
        || username.length <= 3
        || username.length > 20)
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
        validate_username(data.username)
        validate_username(data.nickname) // validate the nick as an username, cuz why not? lols. works just as fine aswell this way
        data.password = generateHash(data.password)

        r = await query(con, "INSERT INTO Users(username, nickname, password_hash) VALUES(?, ?, ?); SELECT LAST_INSERT_ID()", [data.username, data.nickname, data.password])        
        userId = r[1][0]["LAST_INSERT_ID()"]
        let hash = await createSession(con, userId)
        res.end(JSON.stringify({hash: hash, userId: userId}))
    },

    // username, password
    // -> userId, hash
    login: async (con, res, data) => {
        validate_input(data, ["username", "password"])
        data.password = generateHash(data.password)
        r = await query(con, "SELECT COUNT(*) FROM Users WHERE username = ? AND password_hash = ?", [data.username, data.password])
        if(r[0]["COUNT(*)"] == 0) throw "invalid auth for user "+data.username

        userId = (await query(con, "SELECT id FROM Users WHERE username = ?", data.username))[0]["id"]
        let hash = await createSession(con, userId)
        res.end(JSON.stringify({hash: hash, userId: userId}))
    },

    /* userId, hash, _nickname, _birthDate, _location, _bio */
    changePublicInfo: async (con, res, data) => {
        validate_input(data, ["userId", "hash"])
        await validate_auth(con, data)

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
    }

    /*

                    id int PRIMARY KEY AUTO_INCREMENT,
                    username varchar(20) UNIQUE NOT NULL,
                    nickname varchar(20) NOT NULL,
                    password_hash varchar(64) NOT NULL,
                    email varchar(60),
                    birthDate DATETIME,
                    location varchar(30),
                    bio varchar(100)
    */
}