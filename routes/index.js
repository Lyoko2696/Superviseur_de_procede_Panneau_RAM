/**
* Jimmy Martini 23-09-2021
* Fichier: index.js
* Route de la page index.ejs
* Prend la demande de page, traite les données si necessaire et affiche la page à afficher.
**/

/* Références necessaire à ce fichier */
var express = require('express');
var router = express.Router();
var connection = require('../manageDb');
var { io } = require('../socketApi');
var mqtt = require('mqtt');
var adresseMqtt = "mqtt://192.168.50.40:1883";
var client = mqtt.connect(adresseMqtt);

  /* Variable globales */

/* Banque de données des utilisateurs */
var BDD;

/* Information utile pour la session de l'utilisateur */
var erreur = {target : "", message : ""};
var login = {username : "", password : "", id : 0};

/* Valeurs reçus avec Mqtt */
var balance =    {poids: "0", tare: "0", unite: "lb"};
var powermeter = {VAN: "0", VBN: "0", VAB: "0", IA: "0", IB: "0", KW: "0", KWH: "0", FP: "0"};
var panneau =    {Mode: "manuel", Pompe: "off", ValveEEC: "off", ValveEEF: "off", ValveGB: "0", ValvePB: "0", ValveEC: "0",ValveEF: "0", NivGB: "0",
                      NivPB: "0", TmpGB: "---", TmpPB: "0", ConsNivGB: "0", ConsNivPB: "0", ConsTmpGB: "---", ConsTmpPB: "0"};
var melangeur =  {recetteStatut: "---", mode: "manuel", motA: "off", motB: "off", motC: "off", recette: "", recetteGo: "stop"};
var shopvac =    {sequence: "---", NivA: "0", NivB: "0", NivC: "0"};
var alarmes =    {ALR_GB_OVF: "", ALR_PB_OVF: "", ALR_GB_NIV_MAX: "", ALR_PB_NIV_MAX: "", ALR_CNX_BAL: "", ALR_CNX_POW: ""}
var valves =     {Ouverture_PB: "0", Ouverture_GB: "0"};

var ignoreMqttFlag = false;

/* GET Page par défault. Redirige vers /connection */
router.get('/', function(req, res, next) {
  res.redirect("/connection");
});

/* GET Page de connection. */
router.get('/connection', function(req, res, next) {
  res.render('./pages/connection', { title: 'Connection', messageErreur: erreur.message });
  resetErrorInfo();
});


/* GET Page d'informations de contacte. */
router.get('/contact', function(req, res, next) {
  res.render('./pages/contact', { title: 'Contact', user: login.username });
});

/* GET Déconnection de l'utilisateur et redirection vers / . */
router.get('/logout', function(req, res, next) {
  console.log("LOG /logout: Utilisateur '"+login.username+"' déconnecté");
  resetUserSession();
  res.redirect("/connection");
});

/* GET Page d'informations de contacte. */
router.get('/accueil', function(req, res, next) {
  if (login.username != "") {
    readDb().then(
      async function(myDb) {
        // Store le résultat de readDb dans la variable globale.
        BDD = myDb;
        if (erreur.target == "erreur") {
          throw("5 Erreur: Target mal/non définie");
        }
        res.render('./pages/accueil', { title: 'Accueil', myDb: BDD, user: login.id, erreurMessage: erreur.message, erreurTarget: erreur.target});
        resetErrorInfo();
      },
      function(error) {
        throw(error);
      }
    ).catch(function (error) {errorReadDB(error);});
  } else {
    res.redirect("/connection");
  }
});

/* POST Page d'accueil de l'utilisateur. */
router.post('/accueil', function(req, res, next) {
  // Met à jour BDD.
  erreur.target = req.body.eTarget;
  erreur.message = req.body.eMessage;
  if(login.username == "") {
    readDb().then(
      async function(myDb) {
        // Store le résultat de readDb dans la variable globale.
        BDD = myDb;
        login.username = req.body.username;
        login.password = req.body.password;
        if (erreur.target == "erreur") {
          throw("5 Erreur: Target mal/non définie");
        }
        console.log("LOG /accueil: Connection pour utilisateur '"+login.username+"'");
        var userCheck = await checkUser(BDD, login.username);
        return userCheck;
      },
      function(error) {
        throw(error);
      }
    ).then(
      async function(val) {
        login.id = val;
        var pwdCheck = await checkUserPassword(BDD, login.id, login.password);
        return pwdCheck;
      },
      function(error) {
        throw(error);
      }
    ).then(
      function(val) {
        login.id = val;
        console.log("LOG /accueil: Utilisateur '"+login.username+"' connecté");
        res.render('./pages/accueil', { title: 'Accueil', myDb: BDD, user: login.id, erreurMessage: erreur.message, erreurTarget: erreur.target});
        resetErrorInfo();
      },
      function(error) {
        throw(error);
      }
    ).catch(function (error) {errorReadDB(error);});
  } else {
    res.redirect('/accueil');
  }
});

/* POST Mise à jour de la banque de donnée demander par l'utilisateur. */
router.post('/update', function(req, res, next) {
  var data = req.body.data;
  erreur.target = req.body.target;
  login.id = req.body.userId;
  /* Requète UPDATE et redirection vers /accueil en POST (307). */
  modifyDb(data, erreur.target, login.id).then(
    function() {
      if( erreur.target == "password") {
        /* Mise à jour de mot de passe dans le serveur pour permettre la reconnection à la page /accueil. */
        login.password = data;
      }
      res.redirect("/accueil");
    },
    function(error) {
      throw(error);
    }
  ).catch(function (error) {
    console.log("CATCH /update:");
    console.log(error);

    if(erreur.target == "message") {
      erreur.message = "Erreur: Un problème est survenu lors de la modification du texte d'accueil.";
    } else if (erreur.target == "password") {
      erreur.message = "Erreur: Un problème est survenu lors de la modification du mot de passe.";
    } else {
      erreur.target = "erreur";
    }
    res.redirect('/accueil');
  });
});

/* GET Page d'information de la balance. */
router.get('/balance', function(req, res, next) {
  res.render('./pages/balance', { title: 'Balance', myDb: BDD, user: login.id, balance: balance});
  resetErrorInfo();
})

/* GET Page d'information du powermeter. */
router.get('/powermeter', function(req, res, next) {
  res.render('./pages/powermeter', { title: 'Powermeter', myDb: BDD, user: login.id, powermeter: powermeter});
  resetErrorInfo();
})

/* GET Page d'information du panneau RAM. */
router.get('/panneau', function(req, res, next) {
  res.render('./pages/panneau', { title: 'Panneau RAM', myDb: BDD, user: login.id, panneau: panneau});
  resetErrorInfo();
})

/* GET Page d'information du panneau RAM. */
router.get('/melangeur', function(req, res, next) {
  res.render('./pages/melangeur', { title: 'Mélangeur', myDb: BDD, user: login.id, melangeur: melangeur, shopvac: shopvac});
  resetErrorInfo();
})

/* Fontion qui compare le nom d'utilisateur donnée à ceux contenue dans la banques de donnée */
/* et retourne un objet promesse avec le id de l'utilisateur s'il existe ou un message d'erreur si l'utilisateur n'existe pas. */
function checkUser(db, user) {
  for (var i = 0;i <= (db.length-1); i++) {
      if ( (db[i].username) == user) {
        return Promise.resolve(db[i].id);
      }
  }
  return Promise.reject("1 checkUser Erreur: Utilisateur '"+user+"' n'existe pas");
}

/* Fontion qui compare le mot de passe donnée à celui associé à l'utilisateur spécifié */
/* et retourne un objet promesse avec le id de l'utilisateur confirmé ou un message d'erreur si le mot de passe n'est pas bon. */
function checkUserPassword(db, id, passw) {
  if ( (db[id-1].password) == passw) {
    return Promise.resolve(db[id-1].id);
  } else {
    return Promise.reject("2 checkUserPassword Erreur: Mot de passe incorrecte");
  }
}

/* Fonction qui gère les erreurs généré par readDB() */
function errorReadDB(error) {
  console.log("CATCH /accueil:");
  console.log(error);

  /* Remise à zéro de la session et définition de message d'erreur à afficher sur la page selon le numéro d'erreur. */
  if ( (error[0] == '1') || (error[0] == '2')) {
    erreur.message = "Erreur: Nom d'utilisateur ou mot de passe incorrect!";
  } else if (error[0] == '3') {
    erreur.message = "Erreur: Probléme de lecture de la banque de donnée! Connection fermée.";
  } else if (error[0] == '5') {
    erreur.message = "Erreur inattendu dans /update. Connection fermée.";
  } else {
    erreur.message = "Erreur inattendu dans /accueil. Connection fermée.";
  }
  resetUserSession();
  res.redirect('/connection');
}

/* Efface les informations d'erreurs pour éviter l'affichage d'une même érreur sur plusieurs pages */
function resetErrorInfo() {
  if(erreur.message != "") {
    erreur.message = "";
  }
  if(erreur.target != "") {
    erreur.target = "";
  }
}
 /* Efface les informations de l'utilisateur présentement connecté */
function resetUserSession() {
  login.username = "";
  login.password = "";
  login.id = 0;
}

/* Fonction qui intéroge toute la banque de donnée et retourne un objet promesse avec les données ou un message d'erreur une fois celle-çi terminé. */
async function readDb() {
  var querystring = 'SELECT * FROM users';
  /* Création de la promesse qui confirmera si le requète SQL est teminé ou s'il y a eu un erreur. */
    var readPromise = await new Promise((resolve, reject) => {
      connection.query(querystring, function(err, rows, fields) {
        if (!err) {
          console.log("LOG readDb(): Requête SELECT réussi");
          resolve(JSON.parse(JSON.stringify(rows)));
        } else {
          reject("3 readDb() "+err);
        };
      });
    });
  return readPromise;
}

/* Fonction qui fait la requète SQL qui met à jour (UPDATE) la donnée spécifié pour l'utilisateur spécifier */
/* et retourne un objet promesse avec le résultat ou un message d'erreur une fois celle-çi temriné.  */
async function modifyDb(data, uTarget, id) {
  /* Construction de la requète selon le type de donnée à modifier. */
  var querystring = 'UPDATE users SET ';
  querystring += uTarget+" = '"+data+"' ";
  querystring += "WHERE id = "+id+";";

  /* Création de la promesse qui confirmera si le requète SQL est teminé ou s'il y a eu un erreur. */
  var updatePromise = await new Promise((resolve, reject) => {
    connection.query(querystring, async function(err, rows, fields) {
      if (!err) {
        console.log("LOG modifyDb(): Requète UPDATE "+login.username+" => "+uTarget+" : '"+data+"' réussi");
        resolve();
      } else {
        reject("4 modifyDb() "+err);
      };
    });
  }); 
  return updatePromise;
}


/* Gestion des message Mqtt avec socket.io */

/* Console.log des connections mqtt et socket.io */
client.on('connect',function() { console.log("LOG Mqtt: Connecté à '" + adresseMqtt + "'"); });

/* Abonnement aux topics Mqtt */
client.subscribe('RAM/+/+/#');

/* Réception et envoie des messages Mqtt avec socket.io */
client.on('message',function(topic,message) {
  var strMessage = message.toString();
  var topicIndex = (topic.lastIndexOf("/")+1);
  if       (topic.includes("/panneau/") && !ignoreMqttFlag) {
    panneau[topic.substr(topicIndex)] = strMessage;
    io.emit(topic.substr(topicIndex), strMessage);
    console.log("LOG Mqtt "+topic.substr(topicIndex)+": "+strMessage);
  } else if(topic.includes("/balance/") && !ignoreMqttFlag) {
    balance[topic.substr(topicIndex)] = strMessage;
    io.emit(topic.substr(topicIndex), strMessage);
    console.log("LOG Mqtt "+topic.substr(topicIndex)+": "+strMessage);
  } else if(topic.includes("/melangeur/") && !ignoreMqttFlag) {
    melangeur[topic.substr(topicIndex)] = strMessage;
    io.emit(topic.substr(topicIndex), strMessage);
    console.log("LOG Mqtt "+topic.substr(topicIndex)+": "+strMessage);
  } else if(topic.includes("/powermeter/") && !ignoreMqttFlag) {
    powermeter[topic.substr(topicIndex)] = strMessage;
    io.emit(topic.substr(topicIndex), strMessage);
    console.log("LOG Mqtt "+topic.substr(topicIndex)+": "+strMessage);
  } else if(topic.includes("/alarmes/etats/") && !ignoreMqttFlag) {
      if(strMessage == "ON") {
        alarmes[topic.substr(topicIndex)] = strMessage;
        io.emit(topic.substr(topicIndex), strMessage);
        console.log("LOG Mqtt "+topic.substr(topicIndex)+": "+strMessage);
      }
  } else if(topic.includes("/shopvac/") && !ignoreMqttFlag) {
    shopvac[topic.substr(topicIndex)] = strMessage;
    io.emit(topic.substr(topicIndex), strMessage);
    console.log("LOG Mqtt "+topic.substr(topicIndex)+": "+strMessage);
  } else if(topic.includes("/valves/") && !ignoreMqttFlag) {
    valves[topic.substr(topicIndex)] = strMessage;
    io.emit(topic.substr(topicIndex), strMessage);
    console.log("LOG Mqtt "+topic.substr(topicIndex)+": "+strMessage);
  }
});

/* Lorsque la connection est active, écoute pour recevoir les socket du client. */

io.on("connection", (socket) => {
  /* Réception des réponses aux alarmes et envoie les "Acknowledgement" approprié. */
  socket.on('ALR_GB_OVF ACK',     function (val) {
    client.publish('RAM/alarmes/etats/ALR_GB_OVF','ACK', {retain: true});
    alarmes.ALR_GB_OVF = val;
    ignoreMqttFlag = true;
  });
  socket.on('ALR_PB_OVF ACK',     function (val) {
    client.publish('RAM/alarmes/etats/ALR_PB_OVF',     'ACK', {retain: true});
    alarmes.ALR_PB_OVF     = val;
    ignoreMqttFlag = true;
  });
  socket.on('ALR_GB_NIV_MAX ACK', function (val) {
    client.publish('RAM/alarmes/etats/ALR_GB_NIV_MAX', 'ACK', {retain: true});
    alarmes.ALR_GB_NIV_MAX = val;
    ignoreMqttFlag = true;
  });
  socket.on('ALR_PB_NIV_MAX ACK', function (val) {
    client.publish('RAM/alarmes/etats/ALR_PB_NIV_MAX', 'ACK', {retain: true});
    alarmes.ALR_PB_NIV_MAX = val;
    ignoreMqttFlag = true;
  });
  socket.on('ALR_CNX_BAL ACK',    function (val) {
    client.publish('RAM/alarmes/etats/ALR_CNX_BAL',    'ACK', {retain: true});
    alarmes.ALR_CNX_BAL    = val;
    ignoreMqttFlag = true;
  });
  socket.on('ALR_CNX_POW ACK',    function (val) {
    client.publish('RAM/alarmes/etats/ALR_CNX_POW',    'ACK', {retain: true});
    alarmes.ALR_CNX_POW    = val;
    ignoreMqttFlag = true;
  });

  /* Réception des commandes pour le mélangeur et le shop vac et envoie ces comandes sur le topic Mqtt approprié. */
  socket.on('cmd_motA',           function (val) {
    client.publish('RAM/melangeur/cmd/motA',           val,   {retain: true});
    melangeur.motA      = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_motB',           function (val) {
    client.publish('RAM/melangeur/cmd/motB',           val,   {retain: true});
    melangeur.motB      = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_motC',           function (val) {
    client.publish('RAM/melangeur/cmd/motC',           val,   {retain: true});
    melangeur.motC      = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_mode_mel',       function (val) {
    client.publish('RAM/melangeur/cmd/mode',           val,   {retain: true});
    melangeur.mode      = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_recette',        function (val) {
    client.publish('RAM/melangeur/cmd/recette',        val,   {retain: true});
    melangeur.recette   = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_Go',             function (val) {
    client.publish('RAM/melangeur/cmd/recetteGo',      val,   {retain: true});
    melangeur.recetteGo = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_force',             function (val) {
    client.publish('RAM/shopvac/cmd/force',      val,   {retain: true});
    ignoreMqttFlag = true;
  });

  /* Réception des commandes pour le panneau RAM et envoie ces comandes sur le topic Mqtt approprié. */
  socket.on('cmd_ValveGB',        function (val) {
    client.publish('RAM/panneau/cmd/ValveGB',          val,   {retain: true});
    panneau.ValveGB   = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ValvePB',        function (val) {
    client.publish('RAM/panneau/cmd/ValvePB',          val,   {retain: true});
    panneau.ValvePB   = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ValveEC',        function (val) {
    client.publish('RAM/panneau/cmd/ValveEC',          val,   {retain: true});
    panneau.ValveEC   = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ValveEF',        function (val) {
    client.publish('RAM/panneau/cmd/ValveEF',          val,   {retain: true});
    panneau.ValveEF   = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ConsNivGB',      function (val) {
    client.publish('RAM/panneau/cmd/ConsNivGB',        val,   {retain: true});
    panneau.ConsNivGB = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ConsNivPB',      function (val) {
    client.publish('RAM/panneau/cmd/ConsNivPB',        val,   {retain: true});
    panneau.ConsNivPB = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ConsTmpPB',      function (val) {
    client.publish('RAM/panneau/cmd/ConsTmpPb',        val,   {retain: true});
    panneau.ConsTmpPB = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ValveEEC',       function (val) {
    client.publish('RAM/panneau/cmd/ValveEEC',         val,   {retain: true});
    panneau.ValveEEC  = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_ValveEEF',       function (val) {
    client.publish('RAM/panneau/cmd/ValveEEF',         val,   {retain: true});
    panneau.ValveEEF  = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_Mode_pan',       function (val) {
    client.publish('RAM/panneau/cmd/Mode',             val,   {retain: true});
    panneau.Mode      = val;
    ignoreMqttFlag = true;
  });
  socket.on('cmd_Pompe',          function (val) {
    client.publish('RAM/panneau/cmd/Pompe',            val,   {retain: true});
    panneau.Pompe     = val;
    ignoreMqttFlag = true;
  });
});


module.exports = router;