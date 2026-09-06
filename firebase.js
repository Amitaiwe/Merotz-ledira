/* ============ firebase.js ============
   Firebase config, initialization, anonymous auth, stats, and nickname
   persistence — moved verbatim from the original inline script.
   No paths, data structure, or behavior were changed. */

import { $ } from './ui.js';

const firebaseConfig = {
  apiKey: "AIzaSyAhcvYFqnIjq_7ciqOl26E6J4pXBDLHdSc",
  authDomain: "race2apt.firebaseapp.com",
  databaseURL: "https://race2apt-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "race2apt",
  storageBucket: "race2apt.firebasestorage.app",
  messagingSenderId: "713805597029",
  appId: "1:713805597029:web:3fcb4f8833cd2a318c398c",
  measurementId: "G-KXEXV5LDZ7"
};

let fbReady = false;
let fbDb = null;
let fbUid = null;
let fbQueue = [];

function fbRunOrQueue(fn){
  if(fbReady && fbUid){
    fn();
  } else {
    fbQueue.push(fn);
  }
}

try{
  firebase.initializeApp(firebaseConfig);
  fbDb = firebase.database();
  firebase.auth().signInAnonymously().catch(function(err){
    console.warn('Firebase anonymous auth failed', err);
  });
  firebase.auth().onAuthStateChanged(function(user){
    if(user){
      fbUid = user.uid;
      fbReady = true;
      attachStatsListener();
      loadStoredNickname();
      const pending = fbQueue;
      fbQueue = [];
      pending.forEach(function(fn){ fn(); });
    } else {
      fbUid = null;
      fbReady = false;
    }
  });
}catch(e){
  console.warn('Firebase init failed', e);
}

export function attachStatsListener(){
  if(!fbDb) return;
  try{
    fbDb.ref('stats').on('value', function(snap){
      const val = snap.val() || {};
      const games = val.gamesPlayed || 0;
      const wins = val.gamesWon || 0;
      const fastest = val.fastestWin || null;
      const fastestName = val.fastestWinName || '';
      $('gGames').textContent = games > 0 ? games.toLocaleString('he-IL') : '0';
      $('gWinRate').textContent = games > 0 ? Math.round((wins/games)*100) + '%' : '-';
      $('gFastest').textContent = fastest ? fastest : '-';
      $('gFastestName').textContent = (fastest && fastestName) ? ('מאת: ' + fastestName) : '';
    }, function(err){
      console.warn('stats listener error', err);
    });
  }catch(e){
    console.warn('attachStatsListener failed', e);
  }
}

export function loadStoredNickname(){
  if(!fbDb || !fbUid) return;
  try{
    fbDb.ref('users/'+fbUid+'/nickname').once('value').then(function(snap){
      const val = snap.val();
      if(val) $('nicknameInput').value = val;
    }).catch(function(err){ console.warn(err); });
  }catch(e){ console.warn(e); }
}

export function saveNickname(nickname){
  if(!fbDb || !nickname) return;
  fbRunOrQueue(function(){
    try{
      fbDb.ref('users/'+fbUid).update({ nickname: nickname, lastPlayed: Date.now() });
    }catch(e){ console.warn(e); }
  });
}

export function recordGamePlayed(){
  if(!fbDb) return;
  fbRunOrQueue(function(){
    try{
      fbDb.ref('stats/gamesPlayed').transaction(function(cur){ return (cur||0)+1; });
    }catch(e){ console.warn(e); }
  });
}

export function recordGameWon(turnsTaken, nickname){
  if(!fbDb) return;
  fbRunOrQueue(function(){
    try{
      fbDb.ref('stats/gamesWon').transaction(function(cur){ return (cur||0)+1; });
      fbDb.ref('stats/fastestWin').transaction(function(cur){
        if(cur === null || turnsTaken < cur) return turnsTaken;
        return cur;
      }).then(function(result){
        if(result.committed && result.snapshot.val() === turnsTaken){
          fbDb.ref('stats/fastestWinName').set(nickname || 'אלמוני');
        }
      }).catch(function(err){ console.warn(err); });
    }catch(e){ console.warn(e); }
  });
}
