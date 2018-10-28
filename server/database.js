module.exports = {
    init_database: (con) => {
        sql = ""

        sql += `ALTER DATABASE Ripplepaw CHARACTER SET utf8;`

        sql += `DROP TABLE IF EXISTS Users;`
        sql += `DROP TABLE IF EXISTS Rooms;`
        sql += `DROP TABLE IF EXISTS Words;`
        sql += `DROP TABLE IF EXISTS Sessions;`
        //sql += `DROP TABLE IF EXISTS GameState;`
        sql += `DROP TABLE IF EXISTS UserToRoom;`
        sql += `DROP TABLE IF EXISTS WordToRoom;`

        sql += `CREATE TABLE Users(
                    id int PRIMARY KEY AUTO_INCREMENT,
                    username varchar(20) UNIQUE NOT NULL,
                    nickname varchar(20) NOT NULL,
                    password_hash varchar(64) NOT NULL,
                    email varchar(60),
                    birthDate DATETIME,
                    location varchar(30),
                    bio varchar(100),
                    guestMode varchar(10) DEFAULT 'false',
                    ts datetime DEFAULT CURRENT_TIMESTAMP
        );`

        sql += `CREATE TABLE Rooms(
                    id int PRIMARY KEY AUTO_INCREMENT,
                    ownerId int NOT NULL,
                    name varchar(30) NOT NULL,
                    maxplayers int NOT NULL,
                    boardWidth int NOT NULL,
                    boardHeight int NOT NULL,
                    password varchar(30) NOT NULL,
                    language varchar(30) NOT NULL /* Romanian, English */,
                    closed varchar(10) DEFAULT 'false',
                    gameStarted varchar(10) DEFAULT 'false',
                    teamColorTurn varchar(20), /* none, red, blue - the team which currently has to take a turn */
                    teamRoleTurn varchar(20), /* spymaster, players */
                    teamGuessesLeft int,
                    hintWord varchar(30),
                    winningTeam varchar(10),
                    ts datetime DEFAULT CURRENT_TIMESTAMP,
                    ts_updated datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`

        sql += `CREATE TABLE Words(
                    id int PRIMARY KEY AUTO_INCREMENT,
                    word varchar(20) NOT NULL,
                    language varchar(20) DEFAULT 'english'
        );`

        sql += `CREATE TABLE Sessions(
                    id int PRIMARY KEY AUTO_INCREMENT,
                    hash varchar(64) NOT NULL,
                    userId int NOT NULL,
                    ts datetime DEFAULT CURRENT_TIMESTAMP
        );`

        sql += `CREATE TABLE UserToRoom(
                    id int PRIMARY KEY AUTO_INCREMENT,
                    userId int NOT NULL,
                    roomId int NOT NULL,
                    role varchar(30) DEFAULT 'spectator', /* spectator, red player, red spymaster, blue player, blue spymaster */
                    banned varchar(10) DEFAULT 'false',
                    ts datetime DEFAULT CURRENT_TIMESTAMP,
                    ts_updated datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`

        // sql += `CREATE TABLE GameState(
        //             id int PRIMARY KEY AUTO_INCREMENT,
        //             roomId int NOT NULL,
        //             gameStarted varchar(10) DEFAULT 'false',
        //             teamColorTurn varchar(20) DEFAULT 'none' /* none, red, blue - the team which currently has to take a turn */
        // );`

        sql += `CREATE TABLE WordToRoom(
                    id int PRIMARY KEY AUTO_INCREMENT,
                    wordId int NOT NULL,
                    roomId int NOT NULL,
                    color varchar(20), /* red, blue, gray, black */
                    revealed varchar(20) DEFAULT 'false',
                    ts datetime DEFAULT CURRENT_TIMESTAMP,
                    ts_updated datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`

        wordsEnglish = "time, way, year, work, government, day, man, world, life, part, house, course, case, system, place, end, group, company, party, information, school, fact, money, point, example, state, business, night, area, water, thing, family, head, hand, order, john, side, home, development, week, power, country, council, use, service, room, market, problem, court, lot, a, war, police, interest, car, law, road, form, face, education, policy, research, sort, office, body, person, health, mother, question, period, name, book, level, child, control, society, minister, view, door, line, community, south, city, god, father, centre, effect, staff, position, kind, job, woman, action, management, act, process, north, age, evidence, idea, west, support, moment, sense, report, mind, church, morning, death, change, industry, land, care, century, range, table, back, trade, history, study, street, committee, rate, word, food, language, experience, result, team, other, sir, section, programme, air, authority, role, reason, price, town, class, nature, subject, department, union, bank, member, value, need, east, practice, type, paper, date, decision, figure, right, wife, president, university, friend, club, quality, voice, lord, stage, king, us, situation, light, tax, production, march, secretary, art, board, may, hospital, month, music, cost, field, award, issue, bed, project, chapter, girl, game, amount, basis, knowledge, approach, series, love, top, news, front, future, manager, account, computer, security, rest, labour, structure, hair, bill, heart, force, attention, movement, success, letter, agreement, capital, analysis, population, environment, performance, model, material, theory, growth, fire, chance, boy, relationship, son, sea, record, size, property, space, term, director, plan, behaviour, treatment, energy, st, peter, income, cup, scheme, design, response, association, choice, pressure, hall, couple, technology, defence, list, chairman, loss, activity, contract, county, wall, paul, difference, army, hotel, sun, product, summer, set, village, colour, floor, season, unit, park, hour, investment, test, garden, husband, employment, style, science, look, deal, charge, help, economy, new, page, risk, advice, event, picture, commission, fish, college, oil, doctor, opportunity, film, conference, operation, application, press, extent, addition, station, window, shop, access, region, doubt, majority, degree, television, blood, statement, sound, election, parliament, site, mark, importance, title, species, increase, return, concern, public, competition, software, glass, lady, answer, earth, daughter, purpose, responsibility, leader, river, eye, ability, appeal, opposition, campaign, respect, task, instance, sale, whole, officer, method, division, source, piece, pattern, lack, disease, equipment, surface, oxford, demand, post, mouth, radio, provision, attempt, sector, firm, status, peace, variety, teacher, show, speaker, baby, arm, base, miss, safety, trouble, culture, direction, context, character, box, discussion, past, weight, organisation, start, brother, league, condition, machine, argument, sex, budget, english, transport, share, mum, cash, principle, exchange, aid, library, version, rule, tea, balance, afternoon, reference, protection, truth, district, turn, smith, review, minute, duty, survey, presence, influence, stone, dog, benefit, collection, executive, speech, function, queen, marriage, stock, failure, kitchen, student, effort, holiday, career, attack, length, horse, progress, plant, visit, relation, ball, memory, bar, opinion, quarter, impact, scale, race, image, trust, justice, edge, gas, railway, expression, advantage, gold, wood, network, text, forest, sister, chair, cause, foot, rise, half, winter, corner, insurance, step, damage, credit, pain, possibility, legislation, strength, speed, crime, hill, debate, will, supply, present, confidence, mary, patient, wind, solution, band, museum, farm, pound, henry, match, assessment, message, football, no, animal, skin, scene, article, stuff, introduction, play, administration, fear, dad, proportion, island, contact, japan, claim, kingdom, video, tv, existence, telephone, move, traffic, distance, relief, cabinet, unemployment, reality, target, trial, rock, concept, spirit, accident, organization, construction, coffee, phone, distribution, train, sight, difficulty, factor, exercise, weekend, battle, prison, grant, aircraft, tree, bridge, strategy, contrast, communication, background, shape, wine, star, hope, selection, detail, user, path, client, search, master, rain, offer, goal, dinner, freedom, attitude, while, agency, seat, manner, favour, pair, crisis, smile, prince, danger, call, capacity, output, note, procedure, theatre, tour, recognition, middle, absence, sentence, package, track, card, sign, commitment, player, threat, weather, element, conflict, notice, victory, bottom, finance, fund, violence, file, profit, standard, jack, route, china, expenditure, second, discipline, cell, pp, reaction, castle, congress, individual, lead, consideration, debt, option, payment, exhibition, reform, emphasis, spring, audience, feature, touch, estate, assembly, volume, youth, contribution, curriculum, appearance, martin, tom, boat, institute, membership, branch, bus, waste, heat, neck, object, captain, driver, challenge, conversation, occasion, code, crown, birth, silence, literature, faith, hell, entry, transfer, gentleman, bag, coal, investigation, leg, belief, total, major, document, description, murder, aim, manchester, flight, conclusion, drug, tradition, pleasure, connection, owner, treaty, tony, alan, desire, professor, copy, ministry, acid, palace, address, institution, lunch, generation, partner, engine, newspaper, cross, reduction, welfare, definition, key, release, vote, examination, judge, atmosphere, leadership, sky, breath, creation, row, guide, milk, cover, screen, intention, criticism, jones, silver, customer, journey, explanation, green, measure, brain, significance, phase, injury, run, coast, technique, valley, drink, magazine, potential, drive, revolution, bishop, settlement, christ, metal, motion, index, adult, inflation, sport, surprise, pension, factory, tape, flow, iron, trip, lane, pool, independence, hole, un, flat, content, pay, noise, combination, session, appointment, fashion, consumer, accommodation, temperature, mike, religion, author, nation, northern, sample, assistance, interpretation, aspect, display, shoulder, agent, gallery, republic, cancer, proposal, sequence, simon, ship, interview, vehicle, democracy, improvement, involvement, general, enterprise, van, meal, breakfast, motor, channel, impression, tone, sheet, pollution, bob, beauty, square, vision, spot, distinction, brown, crowd, fuel, desk, sum, decline, revenue, fall, diet, bedroom, soil, reader, shock, fruit, behalf, deputy, roof, nose, steel, co, artist, graham, plate, song, maintenance, formation, grass, spokesman, ice, talk, program, link, ring, expert, establishment, plastic, candidate, rail, passage, joe, parish, ref, emergency, liability, identity, location, framework, strike, countryside, map, lake, household, approval, border, bottle, bird, constitution, autumn, cat, agriculture, concentration, guy, dress, victim, mountain, editor, theme, error, loan, stress, recovery, electricity, recession, wealth, request, comparison, lewis, white, walk, focus, chief, parent, sleep, mass, jane, bush, foundation, bath, item, lifespan, lee, publication, decade, beach, sugar, height, charity, writer, panel, struggle, dream, outcome, efficiency, offence, resolution, reputation, specialist, taylor, pub, co-operation, port, incident, representation, bread, chain, initiative, clause, resistance, mistake, worker, advance, empire, notion, mirror, delivery, chest, licence, frank, average, awareness, travel, expansion, block, alternative, chancellor, meat, store, self, break, drama, corporation, currency, extension, convention, partnership, skill, furniture, round, regime, inquiry, rugby, philosophy, scope, gate, minority, intelligence, restaurant, consequence, mill, golf, retirement, priority, plane, gun, gap, core, uncle, thatcher, fun, arrival, snow, no, command, abuse, limit, championship"
        wordsEnglish = wordsEnglish.split(", ").map(word => [word, "english"]).filter(word => word[0].length >= 3)
        wordsRomanian = ["câine", "pisică", "urs", "maimuță", "porumbel", "zebră", "girafă", "tren", "locomotivă", "mașină", "autoturism", "copac", "frunză", "nor", "cer", "telefon", "aragaz", "farfurie", "scaun", "masa", "tablă", "birou", "sandviș", "spaghete", "grătar", "parc", "bancă", "școală", "liceu", "pahar", "ochelari", "plapumă", "țară", "săptămână", "casa", "putere", "problemă", "curte", "război", "cameră", "serviciu", "drum", "față", "banană", "măr", "portocală", "gutuie", "lămăie", "pepene", "ananas", "kiwi", "mango", "strugure", "roșie", "ceapă", "cuțit", "ospătar", "chelner", "frizer", "agent", "broker", "șef", "falafel", "salată", "creion", "pix", "hartie", "carnet", "notă", "fermoar", "bagaj", "buzunar", "pălărie", "șapcă", "ciocolată", "bere", "vin", "tequila", "votcă", "whisky", "fizică", "matematică", "biologie", "stea", "cometă", "satelit", "soare", "planetă", "centură", "extraterestru", "film", "muzică", "bas", "chitară", "tobă", "fluier", "pian", "vioară", "violoncel", "triunghi", "pătrat", "pentagon", "linie", "punct", "hexagon", "cub", "cilindru", "spațiu", "termen", "condiție", "lac", "mare", "puț", "șanț", "lichior", "leac", "medicament", "lapte", "râu", "fluviu", "deal", "munte", "vârf", "rachetă", "raliu", "scândură", "mușuroi", "val", "nisip", "litoral", "petrecere", "revelion"]
        wordsRomanian = wordsRomanian.map(word => [word, "romanian"])
        sql += "INSERT INTO Words(word, language) VALUES ?;"

        words = wordsEnglish.concat(wordsRomanian)
        con.query(sql, [words], err => {if(err) throw err;})
    }
}
/*(<- username, nickname, password, _email, _birthDate, _location, _bio)
(<- username, password)
(<- username -> username, nickname,)
(name, maxplayers, password, boardWidth, boardHeight)
(-> [name, [nicknamePlayersArray], maxplayers, boardWidth, boardHeight])
(<- roomId)
(role = "player" / "spymaster")
(team = 1, 2, 3, 4,...)
(both teams have to have)
(boardWidth, boardHeight, wordArray)*/