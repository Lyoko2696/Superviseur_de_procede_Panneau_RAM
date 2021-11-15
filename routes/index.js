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

/* Variable globales */
var BDD;
var username;
var password;

/* GET Page de connection. */
router.get('/', function(req, res, next) {
  res.render('./pages/index', { title: 'Express', messageErreur: "" });
});

/* GET Page d'informations de contacte. */
router.get('/contact', function(req, res, next) {
  res.render('./pages/contact', { title: 'Contact', user: username });
});

/* GET Déconnection de l'utilisateur et redirection vers / . */
router.get('/logout', function(req, res, next) {
  username = "";
  password = "";
  console.log("Log /update: Déconnecté!");
  res.redirect("/");
});

/* POST Page d'accueil de l'utilisateur. */
router.post('/accueil', function(req, res, next) {
  // Met à jour BDD.
  var eTarget = req.body.eTarget;
  var eMessage = req.body.eMessage;
  readDb().then(
    async function(myDb) {
      // Store le résultat de readDb dans la variable globale.
      BDD = myDb;
      if ((username == "") || (typeof username == 'undefined')) {
        username = req.body.username;
        password = req.body.password;
      }
      if (eTarget == "erreur") {
        throw("5 Erreur: Target mal/non définie. Ni message, ni password");
      }
      console.log("Log /accueil: Connection "+username);
      var userCheck = await checkUser(BDD, username);
      return userCheck;
    },
    function(error) {
      throw(error);
    }
  ).then(
    async function(userId) {
      var pwdCheck = await checkUserPassword(BDD, userId, password);
      return pwdCheck;
    },
    function(error) {
      throw(error);
    }
  ).then(
    function(userId) {
      console.log("Log /accueil: Connecté!");
      res.render('./pages/accueil', { title: 'Accueil', myDb: BDD, user: userId, erreurMessage: eMessage, erreurTarget: eTarget});
    },
    function(error) {
      throw(error);
    }
  ).catch(function (error) {
    console.log("Catch /accueil:");
    console.log(error);
    var message;
    /* Remise à zéro de la session et définition de message d'erreur à afficher sur la page selon le numéro d'erreur. */
    if ( (error[0] == '1') || (error[0] == '2')) {
      message = "Erreur: Nom d'utilisateur ou mot de passe incorrect!";
    } else if (error[0] == '3') {
      message = "Erreur: Probléme de lecture de la banque de donnée! Connection fermée.";
    } else if (error[0] == '5') {
      message = "Erreur inattendu dans /update. Connection fermée.";
    } else {
      message = "Erreur inattendu dans /accueil. Connection fermée.";
    }
    username = "";
    password = "";
    res.render('./pages/index', { title: 'Express', messageErreur: message });
    }
  );
});

/* POST Mise à jour de la banque de donnée demander par l'utilisateur. */
router.post('/update', function(req, res, next) {
  var data = req.body.data;
  var target = req.body.target;
  var userId = req.body.userId;
  /* Requète UPDATE et redirection vers /accueil en POST (307). */
  modifyDb(data, target, userId).then(
    function() {
      if( target == "password") {
        /* Mise à jour de mot de passe dans le serveur pour permettre la reconnection à la page /accueil. */
        password = data;
      }
      res.redirect(307, "/accueil");
    },
    function(error) {
      throw(error);
    }
  ).catch(function (error) {
    console.log("Catch /update:");
    console.log(error);

    var message;
    if(target == "message") {
      message = "Erreur: Un problème est survenu lors de la modification du texte d'accueil.";
    } else if (target == "password") {
      message = "Erreur: Un problème est survenu lors de la modification du mot de passe.";
    } else {
      target = "erreur";
    }
    res.render('./pages/accueil', { title: 'Accueil', myDb: BDD, user: userId, erreurMessage: message, erreurTarget: target});
  });
});

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
function checkUserPassword(db, id, password) {
  if ( (db[id-1].password) == password) {
    return Promise.resolve(db[id-1].id);
  } else {
    return Promise.reject("2 checkUserPassword Erreur: Mot de passe incorrecte!");
  }
}

/* Fonction qui intéroge toute la banque de donnée et retourne un objet promesse avec les données ou un message d'erreur une fois celle-çi terminé. */
async function readDb() {
  var querystring = 'SELECT * FROM users';
  /* Création de la promesse qui confirmera si le requète SQL est teminé ou s'il y a eu un erreur. */
    var readPromise = await new Promise((resolve, reject) => {
      connection.query(querystring, function(err, rows, fields) {
        if (!err) {
          console.log("Log readDb(): Requête SELECT OK!");
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
async function modifyDb(data, target, userId) {
  /* Construction de la requète selon le type de donnée à modifier. */
  var querystring = 'UPDATE users SET ';
  querystring += target+" = '"+data+"' ";
  querystring += "WHERE id = "+userId+";";

  /* Création de la promesse qui confirmera si le requète SQL est teminé ou s'il y a eu un erreur. */
  var updatePromise = await new Promise((resolve, reject) => {
    connection.query(querystring, async function(err, rows, fields) {
      if (!err) {
        console.log("Log modifyDb(): Requète UPDATE "+username+" => "+target+" : "+data+" OK!");
        resolve();
      } else {
        reject("4 modifyDb() "+err);
      };
    });
  }); 
  return updatePromise;
}

module.exports = router;