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

    assignWordsToRoom: async (con, roomId, language, width, height) => {
        let query = module.exports.query
        // Assign Words
        words = await query(con, "SELECT id FROM Words WHERE language = ? ORDER BY RAND() LIMIT ?", [language, width*height])

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

        // Shuffle these words :D
        for(let index = wordsToRoom.length - 1; index > 0; --index){
            let randomIndex = parseInt(Math.random() * index); // [0, index]
            let aux = wordsToRoom[index]
            wordsToRoom[index] = wordsToRoom[randomIndex]
            wordsToRoom[randomIndex] = aux
            //[wordsToRoom[randomIndex], wordsToRoom[index]] = [wordsToRoom[index], wordsToRoom[randomIndex]]
        }

        await query(con, "INSERT INTO WordToRoom(wordId, roomId, color) VALUES ?", [wordsToRoom])
    },

    VALID_ROLES: ["red player", "blue player", "spectator", "red spymaster", "blue spymaster"]
}