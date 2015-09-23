(function() {

  var app = angular.module('Trivia', ['Profile']);

  //factory to get and hold question data
  //also has methods for cleaning and augmenting question data
  app.factory('Questions', ['$http', function($http) {
    var obj = {};

    obj.getQuestions = function() { // retrieves questions from backend
      return $http.get('/api/trivia').success(function(data) {
        // using Angular $http service to query our questions route
        // success cb executes when request returns
        // route returns a list of questions
        obj.questions = data;
        console.log('getQuestions: questions[0]');
        console.log(obj.questions[0]);
      });
    };

    obj.updateUser = function(user){
      return $http.put('/api/users', {
        username: user.username,
        score: user.score,
        correct: user.correct,
        correctStreak: user.correctStreak,
        answered: user.answered
      });
    };

    return obj;
  }]);


  app.controller('TriviaController', ['$scope', '$http', 'Questions', '$interval', '$location', 'ProfileFactory', function($scope, $http, Questions, $interval, $location, ProfileFactory) {

    //sample trivia api response for chai test
    $scope.questions = [
      {
        "id": 46207,
        "answer": "England",
        "question": "This country's 1689 Bill of Rights stated that no Roman Catholic would ever rule it",
        "value": 100,
        "airdate": "2000-11-23T12:00:00.000Z",
        "created_at": "2014-02-11T23:13:46.149Z",
        "updated_at": "2014-02-11T23:13:46.149Z",
        "category_id": 5724,
        "game_id": null,
        "invalid_count": null,
        "category": {
          "id": 5724,
          "title": "catholicism",
          "created_at": "2014-02-11T23:13:46.044Z",
          "updated_at": "2014-02-11T23:13:46.044Z",
          "clues_count": 10
        }
      }
    ];

    $scope.updateUser = Questions.updateUser;
    $scope.username = ProfileFactory.getUsername();
    $scope.userScores;
    $scope.questionNums = [];
    $scope.waitingForNext = false;
    $scope.validGameRequest = false;
    $scope.invalidGameRequest = false;

    // initialize game data
    $scope.gameDataInit = function() {
      $scope.answered = 0;
      $scope.correct = 0;
      $scope.correctStreak = 0;
      $scope.currentStreak = 0;
      $scope.score = 0;
    };

    // for question navigation
    $scope.nextLoc = function() {
      $scope.waitingForNext = false;
      $scope.questionCount++;
      $scope.navLoc = $scope.questionNums[$scope.questionCount];
      $scope.$apply();

      $scope.setCountdown();

    };

    //for getting trivia questions from the jService API
    $scope.getQuestions = function() {
      Questions.getQuestions()
        .success(function(data) {
          $scope.questions = data;
          console.log("getQuestions[0]: ");
          console.log($scope.questions[0]);
        });
    };
    $scope.getQuestions();

    //for handling user answers to trivia
   $scope.checkAnswer = function(question, answer) {
      $scope.answered++;
      if(answer === question.answer) {
        $scope.correct++;
        $scope.currentStreak++;
        $scope.score += Math.floor(Math.sqrt(+question.level) * 50 + $scope.counter);

        // broadcast our score update
        $scope.socket.emit('scoreupdate', {username: $scope.username, score: $scope.score});
      } else {
        $scope.currentStreak = 0;
      }
      if($scope.currentStreak > $scope.correctStreak){
        $scope.correctStreak = $scope.currentStreak;
      }
      $scope.socket.emit('finishedq', {username: $scope.username, score: $scope.score});

      // set a flag so that we show a message that we are waiting for
      // other players to complete this round
      $scope.waitingForNext = true;
    };



    //Timer uses timeout function
    //cancels a task associated with the promise
    $scope.setCountdown = function() {
      //resets the timer
      if(angular.isDefined($scope.gameTimer)) {
        $interval.cancel($scope.gameTimer);
        $scope.gameTimer = undefined;
      }
      //initialize timer number
      $scope.counter = 15;
      
      // countdown display per question.
      $scope.gameTimer = $interval(function() {
        if ($scope.counter > 0) {
          $scope.counter--;
        }

        if($scope.counter === 0) {
          $scope.socket.emit('finishedq', {username: $scope.username, score: $scope.score});
        }
      }, 1000);
    };
    //cancel timer if user navigates away from questions
    $scope.$on('$destroy', function() {
      $interval.cancel($scope.gameTimer);
    });

    $scope.setupSocket = function() {
      $scope.socket = io(window.location.origin + '/' + $scope.code);
      $scope.socket.emit('newuser', $scope.username);

      $scope.socket.on('userlist', function(userList) {
        $scope.userScores = userList;
        $scope.$apply();
      });
      
      $scope.socket.on('startgame', function(questions) {
        $scope.questionNums = questions;
        $scope.startGame();
      });

      $scope.socket.on('scoreupdate', function(data) {
        $scope.userScores[data.username] = data.score;
        $scope.$apply();
      });

      $scope.socket.on('nextq', function(data) {
        $scope.userScores = data;
        $scope.nextLoc();
      });

      $scope.socket.on('endgame', function(data) {
        $scope.userScores = data;
        $scope.endGame();
      });
    };

    // Request a new game from the server;
    // on success, we receive a code for our game room / socket namespace
    $scope.newGame = function() {
      return $http.get('/api/game').success(function(data) {
        $scope.code = data.code;
        $scope.initiatedGame = true;
        $scope.validGameRequest = true;
        $scope.setupSocket();
      });
    };

    $scope.joinGame = function() {
      // $scope.code should be set from the form model
      $scope.code = $scope.formCode;

      return $http.put('/api/game/join', {code: $scope.code})
      .success(function(data) {
        $scope.initiatedGame = false;
        $scope.validGameRequest = true;

        $scope.setupSocket();
      }).error(function(data) {
        $scope.invalidGameRequest = true;
      });
    };

    $scope.initiateGame = function() {
      $scope.socket.emit('initiategame');
    };

    $scope.startGame = function() {
      // initialize the question state: use the first question number
      $scope.questionCount = 0;
      $scope.navLoc = $scope.questionNums[$scope.questionCount];

      $scope.gameDataInit();
      $scope.setCountdown();

      $scope.$apply(function() {
        $location.path("/trivia/play"); // render play view
        console.log("$location.path: " + $location.path());
      });
    };

    $scope.highScore = function() {
      var currHighest;

      for (var key in $scope.userScores) {
        if (currHighest === undefined) {
          currHighest = [key, $scope.userScores[key]];
        } else if ($scope.userScores[key] > currHighest[1]) {
          currHighest = [key, $scope.userScores[key]];
        }
      }

      $scope.winner = currHighest;
    };

    $scope.endGame = function() {
      $scope.updateUser({
        username: $scope.username,
        score: $scope.score,
        correct: $scope.correct,
        correctStreak: $scope.correctStreak,
        answered: $scope.answered
      });

      // calculate who won for display in the endgame view
      $scope.highScore();
      $location.path("/trivia/endgame"); // render endgame view
    };

  }]);

})();