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
var adresseMqtt = "mqtt://172.17.15.103:1883";
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
var panneau =    {Mode: "Manuel", Pompe: "Off", ValveEEC: "Off", ValveEEF: "Off", ValveGB: "0", ValvePB: "0", ValveEC: "0",ValveEF: "0", NivGB: "0",
                      NivPB: "0", TmpGB: "---", TmpPB: "0", ConsNivGB: "0", ConsNivPB: "0", ConsTmpGB: "---", ConsTmpPB: "0", PurgeGB: "0", PurgePB: "0"};
var melangeur =  {recetteStatut: "---"};
var shopvac =    {sequence: "---", NivA: "0", NivB: "0", NivC: "0"};
var alarmes =    {ALR_GB_OVF: "", ALR_PB_OVF: "", ALR_GB_NIV_MAX: "", ALR_NIV_PB_MAX: "", ALR_CNX_BAL: "", ALR_CNX_POW: ""}

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
client.subscribe('RAM/+/etats/#');

/* Réception et envoie des messages Mqtt avec socket.io */
client.on('message',function(topic,message) {
  var strTopic = topic.toString();
  var strMessage = message.toString();
  var topicIndex = 0;
  console.log("LOG Mqtt "+strTopic.substr(topicIndex)+": "+strMessage);
  if       (strTopic.includes("/panneau/")) {
    topicIndex = (strTopic.lastIndexOf("/")+1);
    panneau[strTopic.substr(topicIndex)] = strMessage;
    io.emit(strTopic.substr(topicIndex), strMessage);
  } else if(strTopic.includes("/balance/")) {
    topicIndex = (strTopic.lastIndexOf("/")+1);
    balance[strTopic.substr(topicIndex)] = strMessage;
    io.emit(strTopic.substr(topicIndex), strMessage);
  } else if(strTopic.includes("/melangeur/")) {
    topicIndex = (strTopic.lastIndexOf("/")+1);
    melangeur[strTopic.substr(topicIndex)] = strMessage;
    io.emit(strTopic.substr(topicIndex), strMessage);
  } else if(strTopic.includes("/powermeter/")) {
    topicIndex = (strTopic.lastIndexOf("/")+1);
    powermeter[strTopic.substr(topicIndex)] = strMessage;
    io.emit(strTopic.substr(topicIndex), strMessage);
  } else if(strTopic.includes("/alarmes/etats/")) {
      if(strMessage == "ON") {
        topicIndex = (strTopic.lastIndexOf("/")+1);
        alarmes[strTopic.substr(topicIndex)] = strMessage;
        io.emit(strTopic.substr(topicIndex), strMessage);
      }
  } else if(strTopic.includes("/shopvac/")) {
    topicIndex = (strTopic.lastIndexOf("/")+1);
    shopvac[strTopic.substr(topicIndex)] = strMessage;
    io.emit(strTopic.substr(topicIndex), strMessage);
  } //else if(strTopic.includes("/valves/")) {
    //if       (strTopic.includes("Ouverture_PB")) {
      
    //} else if(strTopic.includes("Ouverture_GB")) {
      
    //}
  //}
});

/* Réception des réponses aux alarmes et envoie les "Acknowledgement" approprié. */
io.on('ALR_GB_OVF ACK',     function (val) { client.publish('ALR_GB_OVF',     'ACK', {retain: true}); });
io.on('ALR_PB_OVF ACK',     function (val) { client.publish('ALR_PB_OVF',     'ACK', {retain: true}); });
io.on('ALR_GB_NIV_MAX ACK', function (val) { client.publish('ALR_GB_NIV_MAX', 'ACK', {retain: true}); });
io.on('ALR_PB_NIV_MAX ACK', function (val) { client.publish('ALR_PB_NIV_MAX', 'ACK', {retain: true}); });
io.on('ALR_CNX_BAL ACK',    function (val) { client.publish('ALR_CNX_BAL',    'ACK', {retain: true}); });
io.on('ALR_CNX_POW ACK',    function (val) { client.publish('ALR_CNX_POW',    'ACK', {retain: true}); });

module.exports = router;