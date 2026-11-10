(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var S={wake:"vox",listening:false,speaking:false,voice:true,wakeUntil:0,events:[],docs:[],debrief:null,ledger:[],msgs:[]};
var Rec=window.SpeechRecognition||window.webkitSpeechRecognition;
var rec=null,recOn=false;
var DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var STOP={the:1,and:1,for:1,that:1,with:1,this:1,from:1,have:1,will:1,are:1,was:1,were:1,you:1,your:1,not:1,but:1,they:1,their:1,has:1,had:1,can:1,all:1,our:1,out:1,about:1,when:1,what:1,who:1,which:1,there:1,been:1,would:1,could:1,should:1,into:1,than:1,then:1,them:1,also:1,just:1,more:1,some:1,any:1,its:1};

function esc(s){return String(s).replace(/[&<>"]/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":"&quot;";});}
function clean(s){return String(s).replace(/[\s.!?]+$/,"");}
function cap(s){return s.replace(/\b([a-z])/g,function(m){return m.toUpperCase();});}
function setStatus(t,cls){$("status").textContent=t;var o=$("orb");o.className="orb"+(cls?" "+cls:"");}
function render(){
  var h="";
  for(var i=0;i<S.msgs.length;i++){var m=S.msgs[i];h+='<div class="msg '+m.k+'">'+esc(m.t)+'</div>';}
  var L=$("log");L.innerHTML=h;L.scrollTop=L.scrollHeight;
}
function log(kind,text){S.msgs.push({k:kind,t:text});if(S.msgs.length>80)S.msgs.shift();render();}

/* ---------- speech out ---------- */
function speak(text){
  if(!S.voice||!window.speechSynthesis)return;
  try{
    window.speechSynthesis.cancel();
    var u=new SpeechSynthesisUtterance(text.length>420?text.slice(0,420):text);
    u.rate=1.02;
    u.onstart=function(){S.speaking=true;stopRec();setStatus("Speaking","talking");};
    u.onend=function(){S.speaking=false;setStatus(S.listening?"Listening for Hey "+cap(S.wake):"Idle",S.listening?"on":"");if(S.listening)startRec();};
    u.onerror=function(){S.speaking=false;if(S.listening)startRec();};
    window.speechSynthesis.speak(u);
  }catch(e){}
}

/* ---------- speech in ---------- */
function startRec(){
  if(S.useLocal){startLocal();return;}
  if(!Rec||S.speaking||recOn)return;
  try{
    if(!rec){
      rec=new Rec();rec.continuous=true;rec.interimResults=false;rec.lang="en-US";
      rec.onresult=function(ev){
        for(var i=ev.resultIndex;i<ev.results.length;i++){
          if(ev.results[i].isFinal){heard(ev.results[i][0].transcript);}
        }
      };
      rec.onerror=function(e){
        var code=e&&e.error;
        if(code==="no-speech"||code==="aborted")return;
        if(code==="network"){
          log("sys","Chrome's speech service couldn't be reached, so I'm switching to on-device voice.");
          var wasOn=S.listening||Date.now()<S.wakeUntil;
          recOn=false;setLocal(true);if(wasOn){S.listening=true;$("listenBtn").textContent="Always listening: on";startLocal();}
          return;
        }
        S.listening=false;$("listenBtn").textContent="Always listening: off";
        if(code==="not-allowed"||code==="service-not-allowed"){
          setStatus("Microphone blocked","");
          log("sys",micHelp("The browser refused speech recognition ("+code+")."));
        }else if(code==="audio-capture"){
          setStatus("No microphone found","");
          log("sys","No microphone was found. Plug one in, or choose it in Windows sound settings, then try again.");
        }else if(code==="network"){
          setStatus("Speech service unreachable","");
          log("sys","Chrome's speech service couldn't be reached. It needs an internet connection. Typing still works.");
        }else{
          setStatus("Speech error","");
          log("sys","Speech error: "+code+". Typing still works.");
        }
      };
      rec.onend=function(){recOn=false;if(S.listening&&!S.speaking){setTimeout(startRec,250);}};
    }
    rec.start();recOn=true;
  }catch(e){recOn=false;}
}
function stopRec(){if(S.useLocal)return;try{if(rec&&recOn)rec.stop();}catch(e){}recOn=false;}

/* ---------- on-device speech (Vosk, no Google service) ---------- */
var VOSK_JS="https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
var VOSK_MODEL="https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";
var L={model:null,loading:false,ctx:null,node:null,src:null,stream:null,rec:null,on:false};
function loadVosk(){
  return new Promise(function(res,rej){
    if(window.Vosk)return res();
    var s=document.createElement("script");s.src=VOSK_JS;s.onload=function(){res();};s.onerror=function(){rej(new Error("script"));};document.head.appendChild(s);
  });
}
function startLocal(){
  if(L.on||L.loading)return;
  L.loading=true;
  setStatus(L.model?"Starting on-device voice...":"Loading on-device voice (one time, about 40 MB)...","");
  loadVosk().then(function(){return L.model||Vosk.createModel(VOSK_MODEL);}).then(function(m){
    L.model=m;
    return navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
  }).then(function(stream){
    L.stream=stream;
    L.ctx=new (window.AudioContext||window.webkitAudioContext)();
    var r=new L.model.KaldiRecognizer(L.ctx.sampleRate);L.rec=r;
    r.on("result",function(m){var t=m&&m.result&&m.result.text;if(t&&!S.speaking)heard(t);});
    L.src=L.ctx.createMediaStreamSource(stream);
    L.node=L.ctx.createScriptProcessor(4096,1,1);
    L.node.onaudioprocess=function(e){if(S.speaking)return;try{r.acceptWaveform(e.inputBuffer);}catch(x){}};
    L.src.connect(L.node);L.node.connect(L.ctx.destination);
    L.on=true;L.loading=false;
    setStatus(S.listening?"Listening for Hey "+cap(S.wake):"Listening",S.listening||Date.now()<S.wakeUntil?"on":"");
    log("sys","On-device voice is on. It runs on your computer, so no Google speech service is needed.");
  }).catch(function(e){
    L.loading=false;S.listening=false;$("listenBtn").textContent="Always listening: off";
    var n=e&&e.name;
    if(n==="NotAllowedError"||n==="NotFoundError"){setStatus("Microphone blocked","");log("sys",micHelp("The browser would not give this page the microphone ("+n+")."));}
    else{setStatus("On-device voice failed","");log("sys","The on-device voice model couldn't load ("+((e&&e.message)||"error")+"). It needs to download about 40 MB once. Check your connection, or type below.");}
  });
}
function stopLocal(){
  try{if(L.node){L.node.disconnect();L.node.onaudioprocess=null;}}catch(e){}
  try{if(L.src)L.src.disconnect();}catch(e){}
  try{if(L.stream)L.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
  try{if(L.ctx)L.ctx.close();}catch(e){}
  try{if(L.rec&&L.rec.remove)L.rec.remove();}catch(e){}
  L.node=L.src=L.stream=L.ctx=L.rec=null;L.on=false;L.loading=false;
}
function setLocal(on){
  S.useLocal=!!on;
  try{$("localVoice").checked=S.useLocal;}catch(e){}
  if(S.useLocal){try{if(rec&&recOn)rec.stop();}catch(e){}recOn=false;}else{stopLocal();}
}

function wakeRegex(){
  var n=S.wake.replace(/[^a-z0-9 ]/g,"").trim()||"vox";
  if(S.useLocal&&n==="vox")n="(?:vox|vocs|box|vax|fox|vogue|folks)";
  return new RegExp("\\b(?:hey|hi|okay|ok|hello)[ ,]+"+n+"\\b[ ,.!?]*","i");
}
function heard(text){
  text=String(text||"").trim();if(!text)return;
  var m=text.match(wakeRegex());
  if(m){
    var rest=text.slice(m.index+m[0].length).trim();
    if(rest.length>2){handle(rest);}
    else{S.wakeUntil=Date.now()+9000;log("sys","Heard: Hey "+cap(S.wake));reply("Yes?");}
    return;
  }
  if(Date.now()<S.wakeUntil||S.debrief){handle(text);}
}
function reply(text){log("vox",text);speak(text);}

/* ---------- data ---------- */
function parseDt(v){
  var m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v||"");
  if(!m)return null;
  var allDay=!m[4];
  var d=m[7]?new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])):new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
  return {d:d,allDay:allDay};
}
function parseIcs(text,name){
  var t=text.replace(/\r?\n[ \t]/g,"");var lines=t.split(/\r?\n/);var cur=null,n=0;
  for(var i=0;i<lines.length;i++){
    var L=lines[i];
    if(L==="BEGIN:VEVENT"){cur={};}
    else if(L==="END:VEVENT"){
      if(cur&&cur.start){S.events.push({title:cur.title||"(no title)",start:cur.start.d,allDay:cur.start.allDay,loc:cur.loc||"",src:name});n++;}
      cur=null;
    }else if(cur){
      var ix=L.indexOf(":");if(ix<0)continue;
      var key=L.slice(0,ix).split(";")[0].toUpperCase();var val=L.slice(ix+1);
      if(key==="SUMMARY")cur.title=val.replace(/\\,/g,",").replace(/\\n/g," ");
      else if(key==="DTSTART")cur.start=parseDt(val);
      else if(key==="LOCATION")cur.loc=val.replace(/\\,/g,",");
    }
  }
  S.events.sort(function(a,b){return a.start-b.start;});
  return n;
}
function addDoc(name,text){
  if(/BEGIN:VCALENDAR/.test(text)||/\.ics$/i.test(name)){
    var n=parseIcs(text,name);
    S.docs.push({name:name,kind:"calendar",count:n,lines:[],text:""});
    return "Connected "+name+": "+n+" calendar events.";
  }
  var lines=text.split(/\r?\n/).map(function(x){return x.trim();}).filter(function(x){return x.length>0;});
  S.docs.push({name:name,kind:"text",count:lines.length,lines:lines,text:text});
  return "Connected "+name+": "+lines.length+" lines.";
}
function renderSources(){
  var h="";
  if(!S.docs.length)h='<div class="src">Nothing connected yet.</div>';
  for(var i=0;i<S.docs.length;i++){var d=S.docs[i];h+='<div class="src">'+esc(d.name)+" - "+d.count+(d.kind==="calendar"?" events":" lines")+"</div>";}
  $("sources").innerHTML=h;
}
function readFiles(list){
  for(var i=0;i<list.length;i++){
    (function(f){
      if(f.size>2000000){log("sys",f.name+" is over 2 MB, skipped.");return;}
      var r=new FileReader();
      r.onload=function(){var msg=addDoc(f.name,String(r.result||""));renderSources();reply(msg);};
      r.readAsText(f);
    })(list[i]);
  }
}

/* ---------- date helpers ---------- */
function sod(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function fmtEv(e){
  var d=e.start;var day=DAYS[d.getDay()];
  var t=e.allDay?"all day":d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  return day+" "+d.toLocaleDateString([], {month:"short",day:"numeric"})+", "+t+": "+e.title+(e.loc?" ("+e.loc+")":"");
}
function eventsBetween(a,b){return S.events.filter(function(e){return e.start>=a&&e.start<b;});}
function dueFrom(s){
  var m=/\b(today|tonight|tomorrow|in (?:\d+|a|an|one|two|three|four|five) (?:day|week|month)s?|next week|end of (?:the )?(?:day|week|month)|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)? of [a-z]+|by (?:the )?\d{1,2}(?:st|nd|rd|th)?)\b/i.exec(s);
  return m?m[0]:"";
}

/* ---------- skills ---------- */
function calendarAnswer(l){
  if(!S.events.length)return "I don't have a calendar connected. Load an .ics file on the right and ask me again.";
  var now=new Date(),t0=sod(now),t1=new Date(t0.getTime()+86400000),t2=new Date(t0.getTime()+2*86400000),w=new Date(now.getTime()+7*86400000);
  var list,label;
  if(/tomorrow/.test(l)){list=eventsBetween(t1,t2);label="tomorrow";}
  else if(/today|tonight/.test(l)){list=eventsBetween(now,t1);label="the rest of today";}
  else if(/next|upcoming|coming up/.test(l)){list=S.events.filter(function(e){return e.start>=now;}).slice(0,1);label="next";}
  else{list=eventsBetween(now,w);label="the next 7 days";}
  if(!list.length)return "Nothing on your connected calendar for "+label+".";
  var out=list.slice(0,5).map(fmtEv);
  return (label==="next"?"Your next event: ":"You have "+list.length+" for "+label+": ")+out.join(". ")+(list.length>5?". And "+(list.length-5)+" more.":".");
}
function keywords(q){return q.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(function(w){return w.length>2&&!STOP[w];});}
function searchAnswer(q){
  var kw=keywords(q.replace(/^(find|search|look up|look for|where is|when is|what did|show me)\b/i,""));
  if(!kw.length)return "What should I look for?";
  var hits=[];
  S.events.forEach(function(e){var s=(e.title+" "+e.loc).toLowerCase();if(kw.every(function(k){return s.indexOf(k)>=0;}))hits.push(fmtEv(e));});
  S.docs.forEach(function(d){d.lines.forEach(function(L){var s=L.toLowerCase();if(kw.every(function(k){return s.indexOf(k)>=0;}))hits.push(d.name+": "+L);});});
  if(!hits.length)return "I couldn't find "+kw.join(" ")+" in what's connected.";
  return "I found "+hits.length+". "+hits.slice(0,3).map(clean).join(". ")+".";
}
function summarize(l){
  var doc=null;
  for(var i=0;i<S.docs.length;i++){var base=S.docs[i].name.toLowerCase().replace(/\.[a-z0-9]+$/,"");if(l.indexOf(base)>=0)doc=S.docs[i];}
  if(!doc){var txt=S.docs.filter(function(d){return d.kind==="text";});if(txt.length===1)doc=txt[0];}
  if(!doc||doc.kind!=="text")return S.docs.length?"Which file should I summarize? Say summarize and its name.":"Nothing is connected to summarize.";
  var sents=doc.text.replace(/\s+/g," ").split(/(?:\.|\?|!)\s+/).filter(function(s){return s.length>25;});
  if(sents.length<=3)return sents.join(". ")+".";
  var freq={};keywords(doc.text).forEach(function(w){freq[w]=(freq[w]||0)+1;});
  var scored=sents.map(function(s,ix){var sc=0;keywords(s).forEach(function(w){sc+=freq[w]||0;});return {s:s,ix:ix,sc:sc/Math.sqrt(s.length)};});
  scored.sort(function(a,b){return b.sc-a.sc;});
  var top=scored.slice(0,3).sort(function(a,b){return a.ix-b.ix;}).map(function(x){return x.s;});
  return "In short: "+top.map(clean).join(". ")+".";
}
function owedAnswer(){
  var out=[];
  S.ledger.forEach(function(it){out.push((it.owner||"Someone")+": "+it.task+(it.due?" ("+it.due+")":""));});
  S.docs.forEach(function(d){d.lines.forEach(function(L){if(/(todo|to-do|action item|\[ \]|follow up|follow-up|owe)/i.test(L))out.push(d.name+": "+L);});});
  if(!out.length)return "I don't see open commitments in what's connected. Run a debrief, or connect notes with action items.";
  return "Here's what's open: "+out.slice(0,5).map(clean).join(". ")+(out.length>5?". Plus "+(out.length-5)+" more.":".");
}
function knowAnswer(){
  if(!S.docs.length)return "I only know what you connect, and nothing is connected yet. Load a calendar, notes, or paste text on the right.";
  var parts=S.docs.map(function(d){return d.name+" ("+d.count+(d.kind==="calendar"?" events":" lines")+")";});
  return "I only know what's connected: "+parts.join(", ")+".";
}

/* ---------- debrief ---------- */
var TRIG=/\b(will|won't|promise[d]?|agree[d]?|commit(?:ted)?|send|share|offer(?:ed)?|maybe|might|follow(?: |-)?up|intro(?:duce[d]?)?|owe[s]?|needs? to|going to|deadline|by (?:monday|tuesday|wednesday|thursday|friday|tomorrow|tonight|next week|end of))\b|'ll\b/i;
function extract(text){
  var sents=text.split(/[.!?]+\s+|\n+/).map(function(s){return s.trim();}).filter(function(s){return s.length>8;});
  var items=[];
  sents.forEach(function(s0){
    var s=s0.replace(/^(maybe|perhaps|also|and|then|so|but)\s+/i,"");
    if(!TRIG.test(s0))return;
    var owner=null;
    if(/^(?:i|i'll|i will|i'm)\b/i.test(s))owner="You";
    else{var m=/^([A-Z][a-z]{2,})\s+(?:will|'ll|promised|agreed|needs?|owes|is going|said|could|might|can)/.exec(s);if(m)owner=m[1];else if(/^we\b/i.test(s))owner="We";}
    var firm=null;
    if(/\b(might|maybe|could|perhaps|if)\b/i.test(s))firm="offer";
    else if(/\b(will|promise[d]?|definitely|committed|agreed|owes)\b|'ll\b/i.test(s))firm="firm";
    items.push({task:s,owner:owner,due:dueFrom(s),firm:firm,favor:/\b(owes? us|owe (?:him|her|them)|favou?r|introduced us)\b/i.test(s)});
  });
  return items;
}
function nextQuestion(){
  var D=S.debrief;
  for(var i=0;i<D.items.length;i++){
    var it=D.items[i];
    if(!it.owner)return {i:i,f:"owner",q:"Who owns this: "+clean(it.task)+"?"};
    if(!it.due)return {i:i,f:"due",q:"By when: "+clean(it.task)+"?"};
    if(!it.firm)return {i:i,f:"firm",q:"Is that a firm promise or just an offer: "+clean(it.task)+"?"};
  }
  return null;
}
function confidence(it){
  var miss=((it.owner&&it.owner!=="Unassigned")?0:1)+((it.due&&it.due!=="no deadline")?0:1)+(it.firm==="firm"?0:1);
  return miss===0?"high":miss===1?"medium":"low";
}
function receipt(){
  var D=S.debrief;if(!D||!D.items.length)return "No commitments were captured.";
  var lines=D.items.map(function(it,n){
    return (n+1)+". "+(it.owner||"Unassigned")+" - "+it.task+"\n   Due: "+(it.due||"not set")+" | "+(it.firm==="offer"?"offer":it.firm==="firm"?"firm promise":"unclear")+" | Confidence: "+confidence(it)+"\n   Next: "+(it.owner==="You"?"you do this next":"confirm with "+(it.owner||"the owner"));
  });
  var decide=D.items.filter(function(it){return confidence(it)!=="high";}).length;
  var favors=D.items.filter(function(it){return it.favor;}).length;
  lines.push("");
  lines.push("Needs your decision: "+decide+" item"+(decide===1?"":"s"));
  lines.push("Favors owed: "+(favors?favors+" to repay":"none noted"));
  return lines.join("\n");
}
function endDebrief(){
  var D=S.debrief;S.debrief=null;
  if(!D||!D.items.length){return "Debrief closed. I didn't catch any commitments.";}
  S.debrief=D;var r=receipt();S.debrief=null;
  D.items.forEach(function(it){S.ledger.push(it);});
  $("receipt").textContent=r;
  var firm=D.items.filter(function(it){return confidence(it)==="high";}).length;
  return "Here is your Promise Receipt. I logged "+D.items.length+" commitment"+(D.items.length===1?"":"s")+", "+firm+" with high confidence. Details are on screen.";
}
function debriefTurn(text,l){
  var D=S.debrief;
  if(/\b(end debrief|that'?s all|that is all|i'?m done|we'?re done|finish debrief)\b/.test(l))return endDebrief();
  if(D.ask){
    var a=D.ask,it=D.items[a.i];
    if(/^(skip|pass|next|i don'?t know|dunno)\b/.test(l)){
      if(a.f==="owner")it.owner="Unassigned";else if(a.f==="due")it.due="no deadline";else it.firm="offer";
    }
    else if(a.f==="owner"){
      if(/^(me|i|myself|i do|i am)\b/i.test(text))it.owner="You";
      else{
        var nm=text.replace(/^(it'?s|its|that'?s|that is)\s+/i,"").replace(/[.!?]+$/,"").trim();
        if(nm.split(/\s+/).length>4||!nm)return "Just a name, or say me. "+a.q;
        it.owner=cap(nm);
      }
    }
    else if(a.f==="due"){
      var dv=dueFrom(text);
      if(dv){it.due=dv;}
      else if(/\b(no (date|deadline)|none|no idea|not sure|unknown|open[- ]ended|whenever)\b/i.test(text)){it.due="no deadline";}
      else return "Give me a day or a date, like Friday or next week. Or say no deadline.";
    }
    else if(a.f==="firm"){
      if(/\b(offer|maybe|might|not sure|just|if|could)\b/i.test(text))it.firm="offer";
      else if(/\b(firm|promise|definitely|yes|committed|for sure|will)\b/i.test(text))it.firm="firm";
      else return "Firm promise, or just an offer?";
    }
    D.ask=null;
    var nq=nextQuestion();
    if(nq){D.ask=nq;return nq.q;}
    return "Got it. Anything else from the call? Say end debrief when you're done.";
  }
  var found=extract(text);
  if(!found.length)return "I didn't hear a commitment in that. Tell me who said they'd do what, and by when. Or say end debrief.";
  found.forEach(function(it){D.items.push(it);});
  var q=nextQuestion();
  if(q){D.ask=q;return "Noted "+found.length+" commitment"+(found.length===1?"":"s")+". "+q.q;}
  return "Noted. Anything else, or say end debrief?";
}

/* ---------- brain ---------- */
function brain(text){
  var l=text.toLowerCase().trim();
  if(S.debrief)return debriefTurn(text,l);
  if(/\b(start|begin|run|do)\b.*\bdebrief\b|\bdebrief\b.*\b(call|meeting)\b|^debrief$/.test(l)){
    S.debrief={items:[],ask:null};
    return "Debrief started. Tell me what happened on the call, in your own words. I'll ask about anything vague. Say end debrief when you're done.";
  }
  if(/\b(what do you know|what('?s| is) connected|what data|what can you see|what do you have)\b/.test(l))return knowAnswer();
  if(/\b(calendar|schedule|agenda|meeting|meetings|what'?s on|what is on|next event|appointment)\b/.test(l)&&!/summar/.test(l))return calendarAnswer(l);
  if(/\b(owe|owed|open commitments|commitments|to-?do|to do|action items|what('?s| is) pending|outstanding)\b/.test(l))return owedAnswer();
  if(/\bsummar(?:ize|ise|y)\b/.test(l))return summarize(l);
  if(/^(find|search|look up|look for|where is|when is|what did|show me)\b/.test(l))return searchAnswer(text);
  if(/\b(help|what can you do|how do you work)\b/.test(l))return "I can read your connected calendar, search and summarize your notes, list open commitments, and run a debrief that ends in a Promise Receipt. I only know what you connect.";
  if(/^(hi|hello|hey|yo)\b/.test(l))return "Hi. What do you need?";
  if(/\b(thanks|thank you)\b/.test(l))return "Anytime.";
  var kw=keywords(l);
  if(kw.length&&(S.docs.length||S.events.length)){
    var r=searchAnswer("find "+l);if(r.indexOf("couldn't find")<0)return r;
  }
  return S.docs.length||S.events.length?"I don't know that from what's connected. Try: what's on my calendar, find something, summarize a file, or start a debrief.":"I only know what you connect, and nothing is connected yet. Load a calendar or notes, or say start debrief.";
}
function handle(text){
  S.wakeUntil=0;
  log("me",text);
  setStatus("Thinking","on");
  var r=brain(text);
  reply(r);
  if(!S.speaking)setStatus(S.listening?"Listening for Hey "+cap(S.wake):"Idle",S.listening?"on":"");
}

/* ---------- UI wiring ---------- */
function micHelp(first){
  var host="";try{host=location.host;}catch(e){}
  var embedded=false;try{embedded=(window.top!==window.self);}catch(e){embedded=true;}
  var t=first+" Host: "+host+".";
  if(/athena\.com$/i.test(host)||embedded){
    return t+" This page is embedded or hosted by Athena, which blocks speech input. Open the Hey Vox link in its own browser tab instead: https://arwinangeloreyes-byte.github.io/hey-vox/";
  }
  return t+" Fix: click the lock icon left of the address bar, set Microphone to Allow, then reload. If it still fails, open Windows Settings, Privacy and security, Microphone, and allow your browser. Typing works meanwhile.";
}
function askMic(done){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){done(true);return;}
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    try{stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
    done(true);
  }).catch(function(err){
    var n=err&&err.name;
    setStatus("Microphone blocked","");
    if(n==="NotFoundError"||n==="DevicesNotFoundError"){log("sys","No microphone was found. Plug one in or pick it in Windows sound settings, then try again.");}
    else{log("sys",micHelp("The browser would not give this page the microphone ("+(n||"error")+")."));}
    done(false);
  });
}
function toggleListen(){
  if(!Rec&&!S.useLocal)setLocal(true);
  if(S.listening){S.listening=false;$("listenBtn").textContent="Always listening: off";stopRec();stopLocal();setStatus("Idle","");return;}
  askMic(function(ok){
    if(!ok)return;
    S.listening=true;
    $("listenBtn").textContent="Always listening: on";
    startRec();setStatus("Listening for Hey "+cap(S.wake),"on");
  });
}
function oneShot(){
  if(!Rec&&!S.useLocal)setLocal(true);
  askMic(function(ok){
    if(!ok)return;
    S.wakeUntil=Date.now()+10000;
    startRec();setStatus("Listening","on");
    if(S.useLocal){setTimeout(function(){if(!S.listening&&!S.debrief)stopLocal();},12000);}
  });
}
function setWake(v){
  var n=String(v||"").trim()||"Vox";
  S.wake=n.toLowerCase();
  $("nameTitle").textContent=cap(n);
  $("hint").textContent='Press the orb, or turn on always listening and say "Hey '+cap(n)+'".';
  document.title="Hey "+cap(n)+" - a voice assistant that only knows what you connect";
}
function init(){
  var tries=["What's on my calendar this week?","Start a debrief","Find the budget","What do you know?","What do I owe?"];
  var h="";tries.forEach(function(t){h+='<span class="chip" data-t="'+esc(t)+'">'+esc(t)+'</span>';});
  $("chips").innerHTML=h;
  $("chips").addEventListener("click",function(e){var t=e.target;if(t&&t.getAttribute&&t.getAttribute("data-t"))handle(t.getAttribute("data-t"));});
  $("orb").addEventListener("click",oneShot);
  $("listenBtn").addEventListener("click",toggleListen);
  $("voiceOn").addEventListener("change",function(){S.voice=$("voiceOn").checked;if(!S.voice&&window.speechSynthesis){try{window.speechSynthesis.cancel();}catch(e){}}});
  $("wakeName").addEventListener("input",function(){setWake($("wakeName").value);});
  var send=function(){var v=$("typed").value.trim();if(v){$("typed").value="";handle(v);}};
  $("sendBtn").addEventListener("click",send);
  $("typed").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();send();}});
  $("files").addEventListener("change",function(){readFiles($("files").files);});
  $("addPaste").addEventListener("click",function(){var v=$("paste").value.trim();if(!v)return;reply(addDoc("Pasted text "+(S.docs.length+1),v));$("paste").value="";renderSources();});
  $("clearData").addEventListener("click",function(){S.docs=[];S.events=[];S.ledger=[];renderSources();$("receipt").textContent="Run a debrief to get a receipt.";reply("All connected data is cleared.");});
  $("copyReceipt").addEventListener("click",function(){
    var t=$("receipt").textContent;var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();
    try{document.execCommand("copy");}catch(e){}
    document.body.removeChild(ta);$("copyReceipt").textContent="Copied";
    setTimeout(function(){$("copyReceipt").textContent="Copy receipt";},1500);
  });
  renderSources();
  log("vox","Hi, I'm "+cap(S.wake)+". I only know what you connect. Load a calendar or notes on the right, or say start debrief. Turn on always listening and say Hey "+cap(S.wake)+".");
  if(!Rec)log("sys","Voice input isn't supported in this browser. Typing works everywhere.");
}
try{init();}catch(e){
  var el=document.getElementById("status");if(el)el.textContent="Startup error: "+(e&&e.message);
}
/* ---------- Google Calendar connector (read-only, runs in the browser) ---------- */
var GCID_DEFAULT="564150712589-u8jas0hqjtu39970l7mgopbsaqbgbjng.apps.googleusercontent.com";
function gcId(){try{return localStorage.getItem("vox_gcid")||GCID_DEFAULT;}catch(e){return GCID_DEFAULT;}}
function loadCal(tok){
  var a=new Date();a.setHours(0,0,0,0);var b=new Date(a.getTime()+30*864e5);
  var url="https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin="+encodeURIComponent(a.toISOString())+"&timeMax="+encodeURIComponent(b.toISOString());
  fetch(url,{headers:{Authorization:"Bearer "+tok}}).then(function(r){return r.json();}).then(function(j){
    if(j.error){reply("Google Calendar said: "+(j.error.message||"error")+". If it says the API is off, enable the Google Calendar API for your client ID.");return;}
    S.events=S.events.filter(function(e){return e.src!=="Google Calendar";});
    S.docs=S.docs.filter(function(d){return d.name!=="Google Calendar";});
    var n=0;(j.items||[]).forEach(function(it){
      var s=it.start||{};var d=s.dateTime?new Date(s.dateTime):(s.date?new Date(s.date+"T00:00:00"):null);
      if(d){S.events.push({title:it.summary||"(no title)",start:d,allDay:!s.dateTime,loc:it.location||"",src:"Google Calendar"});n++;}
    });
    S.events.sort(function(x,y){return x.start-y.start;});
    S.docs.push({name:"Google Calendar",kind:"calendar",count:n,lines:[],text:""});
    renderSources();
    reply("Connected your Google Calendar: "+n+" events in the next 30 days. It's read-only, and nothing leaves this page.");
  }).catch(function(){reply("I couldn't reach Google Calendar. Check your connection and try again.");});
}
function connectGoogle(){
  var id=($("gcid").value||"").trim()||gcId();
  if(!id){reply("To connect Google Calendar I need a Google OAuth client ID. Paste yours in the box under Connect data, then press the button again.");return;}
  try{localStorage.setItem("vox_gcid",id);}catch(e){}
  if(!(window.google&&google.accounts&&google.accounts.oauth2)){reply("Google sign-in hasn't loaded. Check your connection and try again.");return;}
  var tc=google.accounts.oauth2.initTokenClient({client_id:id,scope:"https://www.googleapis.com/auth/calendar.readonly",callback:function(r){
    if(r&&r.access_token){loadCal(r.access_token);}else{reply("Google didn't connect: "+((r&&r.error)||"cancelled")+".");}
  }});
  tc.requestAccessToken();
}
function loadGmail(tok){
  var H={headers:{Authorization:"Bearer "+tok}};
  fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=30",H).then(function(r){return r.json();}).then(function(j){
    if(j.error){reply("Gmail said: "+(j.error.message||"error")+". If it says the API is off, the Gmail API needs enabling for this client.");return null;}
    var ids=(j.messages||[]).map(function(m){return m.id;});
    return Promise.all(ids.map(function(id){
      return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+id+"?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",H).then(function(r){return r.json();}).catch(function(){return null;});
    }));
  }).then(function(msgs){
    if(!msgs)return;
    var lines=[];
    msgs.forEach(function(m){
      if(!m||!m.payload)return;
      var h={};(m.payload.headers||[]).forEach(function(x){h[x.name.toLowerCase()]=x.value;});
      var from=String(h.from||"").replace(/<[^>]*>/g,"").replace(/"/g,"").trim()||"Unknown sender";
      lines.push("Email from "+from+" - "+(h.subject||"(no subject)")+" ("+String(h.date||"").slice(0,16)+"): "+String(m.snippet||"").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&"));
    });
    S.docs=S.docs.filter(function(d){return d.name!=="Gmail inbox";});
    S.docs.push({name:"Gmail inbox",kind:"text",count:lines.length,lines:lines,text:lines.join("\n")});
    renderSources();
    reply("Connected your Gmail: your latest "+lines.length+" inbox emails, read-only. Ask me what's waiting, or what I owe someone.");
  }).catch(function(){reply("I couldn't reach Gmail. Check your connection and try again.");});
}
function connectGmail(){
  var id=gcId();
  if(!(window.google&&google.accounts&&google.accounts.oauth2)){reply("Google sign-in hasn't loaded. Check your connection and try again.");return;}
  var tc=google.accounts.oauth2.initTokenClient({client_id:id,scope:"https://www.googleapis.com/auth/gmail.readonly",callback:function(r){
    if(r&&r.access_token){loadGmail(r.access_token);}else{reply("Google didn't connect: "+((r&&r.error)||"cancelled")+".");}
  }});
  tc.requestAccessToken();
}
$("localVoice").addEventListener("change",function(){var on=$("localVoice").checked;setLocal(on);if(S.listening){if(on)startLocal();else startRec();}});
if(!Rec)setLocal(true);
$("gconnect").addEventListener("click",connectGoogle);
$("gmconnect").addEventListener("click",connectGmail);
try{$("gcid").value=gcId();}catch(e){}

window.__vox={ask:function(t){var before=S.msgs.length;handle(t);return S.msgs.slice(before).filter(function(m){return m.k==="vox";}).map(function(m){return m.t;}).join(" | ");},addDoc:function(n,t){var r=addDoc(n,t);renderSources();return r;},state:function(){return {events:S.events.length,docs:S.docs.length,debrief:!!S.debrief,ledger:S.ledger.length};},heard:heard};
})();
