/*
 * Collezione di creature: animali veri, fantastici e mitologici, e qualche strizzata d'occhio alla cultura pop.
 * c = codice Unicode dell'illustrazione Noto Emoji (www/img/a/<id>.svg, scaricata da tools/fetch-creatures.js).
 * r = rarità 0 comune (bianco), 1 non comune (verde), 2 raro (azzurro), 3 epico (viola), 4 leggendario (oro), 5 mitico (rosso).
 * f = [curiosità in inglese semplice, traduzione]: anche una frase da imparare. Nessun nome di marchio come titolo della carta.
 */
(function (B) {
  "use strict";
  B.data = B.data || {};
  B.data.animals = [
    // ---- comuni (bianco)
    { id: "cat", c: "1f408", en: "cat", ipa: "kæt", it: "gatto", r: 0, f: ["A cat sleeps for about sixteen hours a day.", "Un gatto dorme circa sedici ore al giorno."] },
    { id: "dog", c: "1f415", en: "dog", ipa: "dɒɡ", it: "cane", r: 0, f: ["A dog can learn more than a hundred words.", "Un cane può imparare più di cento parole."] },
    { id: "chicken", c: "1f414", en: "chicken", ipa: "ˈtʃɪkɪn", it: "pollo", r: 0, f: ["In a famous adventure game, you should never hit a chicken!", "In un famoso gioco d'avventura non bisogna mai colpire un pollo!"] },
    { id: "cow", c: "1f404", en: "cow", ipa: "kaʊ", it: "mucca", r: 0, f: ["A cow has four stomachs and drinks a bathtub of water a day.", "Una mucca ha quattro stomaci e beve una vasca da bagno d'acqua al giorno."] },
    { id: "pig", c: "1f416", en: "pig", ipa: "pɪɡ", it: "maiale", r: 0, f: ["Pigs are very clean and very clever animals.", "I maiali sono animali molto puliti e molto intelligenti."] },
    { id: "duck", c: "1f986", en: "duck", ipa: "dʌk", it: "anatra", r: 0, f: ["A duck's feathers keep it dry in the rain.", "Le piume di un'anatra la tengono asciutta sotto la pioggia."] },
    { id: "rabbit", c: "1f407", en: "rabbit", ipa: "ˈræbɪt", it: "coniglio", r: 0, f: ["A rabbit's teeth never stop growing.", "I denti di un coniglio non smettono mai di crescere."] },
    { id: "mouse", c: "1f401", en: "mouse", ipa: "maʊs", it: "topo", r: 0, f: ["A mouse can squeeze through a hole the size of a pen.", "Un topo passa attraverso un buco grande come una penna."] },
    { id: "sheep", c: "1f411", en: "sheep", ipa: "ʃiːp", it: "pecora", r: 0, f: ["A sheep can remember the faces of fifty other sheep.", "Una pecora ricorda le facce di cinquanta altre pecore."] },
    { id: "fish", c: "1f41f", en: "fish", ipa: "fɪʃ", it: "pesce", r: 0, f: ["Some fish sleep with their eyes open.", "Alcuni pesci dormono con gli occhi aperti."] },
    { id: "frog", c: "1f438", en: "frog", ipa: "frɒɡ", it: "rana", r: 0, f: ["A frog drinks water through its skin.", "Una rana beve l'acqua attraverso la pelle."] },
    { id: "bee", c: "1f41d", en: "bee", ipa: "biː", it: "ape", r: 0, f: ["A bee visits about two thousand flowers a day.", "Un'ape visita circa duemila fiori al giorno."] },
    { id: "butterfly", c: "1f98b", en: "butterfly", ipa: "ˈbʌtəflaɪ", it: "farfalla", r: 0, f: ["A butterfly tastes with its feet.", "Una farfalla sente i sapori con le zampe."] },
    { id: "ant", c: "1f41c", en: "ant", ipa: "ænt", it: "formica", r: 0, f: ["An ant can carry fifty times its own weight.", "Una formica porta cinquanta volte il suo peso."] },
    { id: "snail", c: "1f40c", en: "snail", ipa: "sneɪl", it: "lumaca", r: 0, f: ["A snail can sleep for three years.", "Una lumaca può dormire per tre anni."] },
    { id: "ladybird", c: "1f41e", en: "ladybird", ipa: "ˈleɪdibɜːd", it: "coccinella", r: 0, f: ["A ladybird eats hundreds of tiny insects in a year.", "Una coccinella mangia centinaia di insetti piccolissimi in un anno."] },

    // ---- non comuni (verde)
    { id: "fox", c: "1f98a", en: "fox", ipa: "fɒks", it: "volpe", r: 1, f: ["A fox can hear a mouse digging under the snow.", "Una volpe sente un topo scavare sotto la neve."] },
    { id: "bear", c: "1f43b", en: "bear", ipa: "beə", it: "orso", r: 1, f: ["A bear sings about the bare necessities of life.", "Un orso canta le cose essenziali della vita."] },
    { id: "panda", c: "1f43c", en: "panda", ipa: "ˈpændə", it: "panda", r: 1, f: ["A panda eats bamboo for twelve hours a day.", "Un panda mangia bambù per dodici ore al giorno."] },
    { id: "penguin", c: "1f427", en: "penguin", ipa: "ˈpeŋɡwɪn", it: "pinguino", r: 1, f: ["A small round bird lives on a lonely island and loves fish.", "Un piccolo uccello rotondo vive su un'isola solitaria e adora il pesce."] },
    { id: "dolphin", c: "1f42c", en: "dolphin", ipa: "ˈdɒlfɪn", it: "delfino", r: 1, f: ["Dolphins call each other by name with special whistles.", "I delfini si chiamano per nome con fischi speciali."] },
    { id: "turtle", c: "1f422", en: "turtle", ipa: "ˈtɜːtl", it: "tartaruga", r: 1, f: ["Dude, an old turtle rides the ocean currents like a surfer.", "Una vecchia tartaruga cavalca le correnti dell'oceano come un surfista."] },
    { id: "owl", c: "1f989", en: "owl", ipa: "aʊl", it: "gufo", r: 1, f: ["A white owl can deliver letters to young wizards.", "Un gufo bianco può consegnare lettere ai giovani maghi."] },
    { id: "kangaroo", c: "1f998", en: "kangaroo", ipa: "ˌkæŋɡəˈruː", it: "canguro", r: 1, f: ["A baby kangaroo lives in its mother's pouch for months.", "Un cucciolo di canguro vive per mesi nel marsupio della mamma."] },
    { id: "horse", c: "1f40e", en: "horse", ipa: "hɔːs", it: "cavallo", r: 1, f: ["The fastest horse on the plains is a hero's best friend.", "Il cavallo più veloce della pianura è il miglior amico di un eroe."] },
    { id: "raccoon", c: "1f99d", en: "raccoon", ipa: "rəˈkuːn", it: "procione", r: 1, f: ["A raccoon washes its food before it eats.", "Un procione lava il cibo prima di mangiarlo."] },
    { id: "hedgehog", c: "1f994", en: "hedgehog", ipa: "ˈhedʒhɒɡ", it: "riccio", r: 1, f: ["A hedgehog has about five thousand spines.", "Un riccio ha circa cinquemila aculei."] },
    { id: "monkey", c: "1f412", en: "monkey", ipa: "ˈmʌŋki", it: "scimmia", r: 1, f: ["A monkey can use tools to open nuts.", "Una scimmia sa usare attrezzi per aprire le noci."] },
    { id: "giraffe", c: "1f992", en: "giraffe", ipa: "dʒɪˈrɑːf", it: "giraffa", r: 1, f: ["A giraffe has the same number of neck bones as you.", "Una giraffa ha lo stesso numero di ossa del collo che hai tu."] },
    { id: "koala", c: "1f428", en: "koala", ipa: "kəʊˈɑːlə", it: "koala", r: 1, f: ["A koala sleeps up to twenty hours a day.", "Un koala dorme fino a venti ore al giorno."] },
    { id: "camel", c: "1f42b", en: "camel", ipa: "ˈkæml", it: "cammello", r: 1, f: ["A camel can drink a hundred litres of water in ten minutes.", "Un cammello beve cento litri d'acqua in dieci minuti."] },
    { id: "clownfish", c: "1f420", en: "clownfish", ipa: "ˈklaʊnfɪʃ", it: "pesce pagliaccio", r: 1, f: ["Just keep swimming, even when the sea is big and scary.", "Continua a nuotare, anche quando il mare è grande e fa paura."] },
    { id: "goat", c: "1f410", en: "goat", ipa: "ɡəʊt", it: "capra", r: 1, f: ["A goat can climb a steep wall like a mountain climber.", "Una capra sa arrampicarsi su una parete ripida come un alpinista."] },

    // ---- rari (azzurro)
    { id: "lion", c: "1f981", en: "lion", ipa: "ˈlaɪən", it: "leone", r: 2, f: ["The king of the savanna rules the circle of life.", "Il re della savana comanda il ciclo della vita."] },
    { id: "tiger", c: "1f405", en: "tiger", ipa: "ˈtaɪɡə", it: "tigre", r: 2, f: ["Every tiger has its own stripes, like your fingerprints.", "Ogni tigre ha le sue strisce, come le tue impronte digitali."] },
    { id: "shark", c: "1f988", en: "shark", ipa: "ʃɑːk", it: "squalo", r: 2, f: ["You are going to need a bigger boat!", "Ti servirà una barca più grande!"] },
    { id: "wolf", c: "1f43a", en: "wolf", ipa: "wʊlf", it: "lupo", r: 2, f: ["Winter is coming, and the wolves are close.", "L'inverno sta arrivando e i lupi sono vicini."] },
    { id: "peacock", c: "1f99a", en: "peacock", ipa: "ˈpiːkɒk", it: "pavone", r: 2, f: ["A peacock opens its tail to show how beautiful it is.", "Un pavone apre la coda per mostrare quanto è bello."] },
    { id: "octopus", c: "1f419", en: "octopus", ipa: "ˈɒktəpəs", it: "polpo", r: 2, f: ["An octopus has three hearts and blue blood.", "Un polpo ha tre cuori e il sangue blu."] },
    { id: "spider", c: "1f577", en: "spider", ipa: "ˈspaɪdə", it: "ragno", r: 2, f: ["A giant spider lives in a dark forest and hates the light.", "Un ragno gigante vive in una foresta buia e odia la luce."] },
    { id: "parrot", c: "1f99c", en: "parrot", ipa: "ˈpærət", it: "pappagallo", r: 2, f: ["A pirate's best friend repeats everything you say.", "Il miglior amico di un pirata ripete tutto quello che dici."] },
    { id: "sloth", c: "1f9a5", en: "sloth", ipa: "sləʊθ", it: "bradipo", r: 2, f: ["The less I know, the slower I go.", "Meno ne so, più vado piano."] },
    { id: "elephant", c: "1f418", en: "elephant", ipa: "ˈelɪfənt", it: "elefante", r: 2, f: ["An elephant never forgets a friend.", "Un elefante non dimentica mai un amico."] },
    { id: "crocodile", c: "1f40a", en: "crocodile", ipa: "ˈkrɒkədaɪl", it: "coccodrillo", r: 2, f: ["A crocodile cannot stick out its tongue.", "Un coccodrillo non riesce a tirare fuori la lingua."] },
    { id: "flamingo", c: "1f9a9", en: "flamingo", ipa: "fləˈmɪŋɡəʊ", it: "fenicottero", r: 2, f: ["A flamingo is pink because of the food it eats.", "Un fenicottero è rosa per il cibo che mangia."] },
    { id: "whale", c: "1f433", en: "whale", ipa: "weɪl", it: "balena", r: 2, f: ["The song of a whale can travel for miles under the sea.", "Il canto di una balena viaggia per miglia sott'acqua."] },
    { id: "scorpion", c: "1f982", en: "scorpion", ipa: "ˈskɔːpiən", it: "scorpione", r: 2, f: ["A scorpion glows blue under a special light.", "Uno scorpione brilla di blu sotto una luce speciale."] },
    { id: "bat", c: "1f987", en: "bat", ipa: "bæt", it: "pipistrello", r: 2, f: ["A bat finds its way in the dark with sound.", "Un pipistrello trova la strada al buio con il suono."] },
    { id: "swan", c: "1f9a2", en: "swan", ipa: "swɒn", it: "cigno", r: 2, f: ["Swans choose one partner and stay together for life.", "I cigni scelgono un solo compagno e restano insieme per la vita."] },

    // ---- epici (viola)
    { id: "stag", c: "1f98c", en: "stag", ipa: "stæɡ", it: "cervo", r: 3, f: ["A silver stag can appear when you think of a happy memory.", "Un cervo d'argento può apparire quando pensi a un ricordo felice."] },
    { id: "eagle", c: "1f985", en: "eagle", ipa: "ˈiːɡl", it: "aquila", r: 3, f: ["Giant eagles arrive just in time to save the day.", "Le aquile giganti arrivano proprio in tempo per salvare la situazione."] },
    { id: "mammoth", c: "1f9a3", en: "mammoth", ipa: "ˈmæməθ", it: "mammut", r: 3, f: ["A huge woolly beast walks across a planet of ice.", "Una bestia lanosa gigante cammina su un pianeta di ghiaccio."] },
    { id: "snake", c: "1f40d", en: "snake", ipa: "sneɪk", it: "serpente", r: 3, f: ["A giant snake sleeps under an old school.", "Un serpente gigante dorme sotto un'antica scuola."] },
    { id: "troll", c: "1f9cc", en: "troll", ipa: "trəʊl", it: "troll", r: 3, f: ["A troll under the bridge asks you a riddle.", "Un troll sotto il ponte ti fa un indovinello."] },
    { id: "fairy", c: "1f9da", en: "fairy", ipa: "ˈfeəri", it: "fata", r: 3, f: ["A tiny fairy shouts: Hey, listen!", "Una minuscola fata grida: Ehi, ascolta!"] },
    { id: "mermaid", c: "1f9dc", en: "mermaid", ipa: "ˈmɜːmeɪd", it: "sirena", r: 3, f: ["A mermaid sings to the sailors from the rocks.", "Una sirena canta ai marinai dalle rocce."] },
    { id: "genie", c: "1f9de", en: "genie", ipa: "ˈdʒiːni", it: "genio", r: 3, f: ["A genie can give you three wishes.", "Un genio può esaudire tre tuoi desideri."] },
    { id: "vampire", c: "1f9db", en: "vampire", ipa: "ˈvæmpaɪə", it: "vampiro", r: 3, f: ["A vampire never goes out in the sunshine.", "Un vampiro non esce mai sotto il sole."] },
    { id: "elf", c: "1f9dd", en: "elf", ipa: "elf", it: "elfo", r: 3, f: ["An elf with a bow never misses the target.", "Un elfo con l'arco non sbaglia mai il bersaglio."] },
    { id: "squid", c: "1f991", en: "squid", ipa: "skwɪd", it: "calamaro", r: 3, f: ["The legend of the giant squid scares every sailor.", "La leggenda del calamaro gigante spaventa ogni marinaio."] },
    { id: "sauropod", c: "1f995", en: "long-necked dinosaur", ipa: "ˌlɒŋ nekt ˈdaɪnəsɔː", it: "dinosauro dal collo lungo", r: 3, f: ["Its neck was longer than a bus.", "Il suo collo era più lungo di un autobus."] },
    { id: "dodo", c: "1f9a4", en: "dodo", ipa: "ˈdəʊdəʊ", it: "dodo", r: 3, f: ["The dodo disappeared more than three hundred years ago.", "Il dodo è scomparso più di trecento anni fa."] },
    { id: "zombie", c: "1f9df", en: "zombie", ipa: "ˈzɒmbi", it: "zombie", r: 3, f: ["A zombie walks slowly and says only one word.", "Uno zombie cammina lentamente e dice una sola parola."] },

    // ---- leggendari (oro)
    { id: "unicorn", c: "1f984", en: "unicorn", ipa: "ˈjuːnɪkɔːn", it: "unicorno", r: 4, f: ["A unicorn appears only to people with a pure heart.", "Un unicorno appare solo a chi ha il cuore puro."] },
    { id: "dragon", c: "1f409", en: "dragon", ipa: "ˈdræɡən", it: "drago", r: 4, f: ["This dragon loves gold more than anything else.", "Questo drago ama l'oro più di ogni altra cosa."] },
    { id: "trex", c: "1f996", en: "T. rex", ipa: "ˌtiː ˈreks", it: "tirannosauro", r: 4, f: ["A huge beast waits in the dark pit, or in a park.", "Una bestia enorme aspetta nella fossa buia, o in un parco."] },
    { id: "wizard", c: "1f9d9", en: "wizard", ipa: "ˈwɪzəd", it: "mago", r: 4, f: ["A wizard is never late, nor is he early.", "Un mago non è mai in ritardo, né in anticipo."] },
    { id: "phoenix", c: "1f426-200d-1f525", en: "phoenix", ipa: "ˈfiːnɪks", it: "fenice", r: 4, f: ["A phoenix cries healing tears and is born again from fire.", "Una fenice piange lacrime che guariscono e rinasce dal fuoco."] },
    { id: "alien", c: "1f47d", en: "alien", ipa: "ˈeɪliən", it: "alieno", r: 4, f: ["A little green master speaks in a very strange order.", "Un piccolo maestro verde parla in un ordine molto strano."] },
    { id: "ghost", c: "1f47b", en: "ghost", ipa: "ɡəʊst", it: "fantasma", r: 4, f: ["Every old castle has a friendly ghost.", "Ogni vecchio castello ha un fantasma gentile."] },
    { id: "ninja", c: "1f977", en: "ninja", ipa: "ˈnɪndʒə", it: "ninja", r: 4, f: ["A ninja moves without making a sound.", "Un ninja si muove senza fare rumore."] },
    { id: "crystal-ball", c: "1f52e", en: "crystal ball", ipa: "ˌkrɪstl ˈbɔːl", it: "sfera di cristallo", r: 4, f: ["The crystal ball shows what may happen tomorrow.", "La sfera di cristallo mostra cosa può succedere domani."] },

    // ---- mitici (rosso, con effetti)
    { id: "ancient-dragon", c: "1f432", en: "ancient dragon", ipa: "ˈeɪnʃənt ˈdræɡən", it: "drago antico", r: 5, f: ["The oldest dragon sleeps on a mountain of gold and fire.", "Il drago più antico dorme su una montagna d'oro e di fuoco."] },
    { id: "robot", c: "1f916", en: "robot", ipa: "ˈrəʊbɒt", it: "robot", r: 5, f: ["Harder, better, faster, stronger: this robot never stops.", "Più duro, migliore, più veloce, più forte: questo robot non si ferma mai."] },
    { id: "mirror-ball", c: "1faa9", en: "mirror ball", ipa: "ˈmɪrə bɔːl", it: "palla a specchi", r: 5, f: ["Let it happen: dance under the lights until the morning.", "Lascia che accada: balla sotto le luci fino al mattino."] },
    { id: "ogre", c: "1f479", en: "ogre", ipa: "ˈəʊɡə", it: "orco", r: 5, f: ["An ogre has layers, like an onion.", "Un orco ha degli strati, come una cipolla."] },
    { id: "ring", c: "1f48d", en: "ring", ipa: "rɪŋ", it: "anello", r: 5, f: ["One ring to rule them all.", "Un anello per governarli tutti."] },
    { id: "volcano", c: "1f30b", en: "volcano", ipa: "vɒlˈkeɪnəʊ", it: "vulcano", r: 5, f: ["The ring must be thrown into the fire of the mountain.", "L'anello deve essere gettato nel fuoco della montagna."] }
  ];
  B.data.rarities = [
    { id: "common", name: "Comune", color: "#d7dde3", refund: 5, w: 55 },
    { id: "uncommon", name: "Non comune", color: "#3fbf5f", refund: 8, w: 25 },
    { id: "rare", name: "Raro", color: "#38b6ff", refund: 12, w: 12 },
    { id: "epic", name: "Epico", color: "#a259ff", refund: 20, w: 5 },
    { id: "legendary", name: "Leggendario", color: "#f5b400", refund: 35, w: 2.5 },
    { id: "mythic", name: "Mitico", color: "#ff3b3b", refund: 60, w: 0.5 }
  ];
})(window.B);
