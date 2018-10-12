const crypto = require("crypto")
const SALT = require("./secrets.js").salt
const log = require("./log.js").log

module.exports = {
    generateHash: (word) => {
        return crypto.createHash("sha256").update(word + SALT).digest("hex")
    },

    query: (con, sql, paramArr) => {
        return new Promise( (resolve, reject) => {
            con.query(sql, paramArr, (err, res) => {
                if(err) return reject(err)

                resolve(res)
            })
        })
    },

    VALID_ROLES: ["red", "blue", "spectator", "red spymaster", "blue spymaster"]
}