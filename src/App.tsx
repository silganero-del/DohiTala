import React, { useState, useEffect } from 'react';
import { Plus, MessageSquare, CheckCircle, Clock, Save, Triangle, Square, Circle, LogOut, User, Lock, ArrowRight, ArrowLeft } from 'lucide-react';
import { Debate, Statement } from './types';
import { auth, db } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc,
  query, 
  orderBy, 
  onSnapshot, 
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestore-error';

export default function App() {
  const [debates, setDebates] = useState<Debate[]>([]);
  const [statements, setStatements] = useState<Record<string, Statement[]>>({});
  const [activeDebateId, setActiveDebateId] = useState<string | null>(null);
  
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginName, setLoginName] = useState(''); 
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [friends, setFriends] = useState<string[]>([]);

  useEffect(() => {
    const savedFriends = localStorage.getItem('friends');
    if (savedFriends) {
      const parsed = JSON.parse(savedFriends);
      const filtered = parsed.filter((f: string) => !['Ami 1', 'Ami 2', 'Ami 3'].includes(f));
      setFriends(filtered);
      localStorage.setItem('friends', JSON.stringify(filtered));
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    
    const q = query(collection(db, 'debates'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Debate[] = [];
      snapshot.forEach(document => {
        const data = document.data();
        fetched.push({
          id: document.id,
          title: data.title,
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
          status: data.status,
          conclusion: data.conclusion || '',
          ownerId: data.ownerId
        });
      });
      setDebates(fetched);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'debates');
    });

    return () => unsubscribe();
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !activeDebateId) return;

    const q = query(
      collection(db, `debates/${activeDebateId}/statements`), 
      orderBy('timestamp', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Statement[] = [];
      snapshot.forEach(document => {
        const data = document.data();
        fetched.push({
          id: document.id,
          authorId: data.authorId,
          authorName: data.authorName,
          text: data.text,
          timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : data.timestamp,
          submitterName: data.submitterName,
          revocations: data.revocations || []
        });
      });
      setStatements(prev => ({ ...prev, [activeDebateId]: fetched }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `debates/${activeDebateId}/statements`);
    });

    return () => unsubscribe();
  }, [authUser, activeDebateId]);

  const activeDebate = debates.find(d => d.id === activeDebateId);
  const activeStatements = activeDebateId ? (statements[activeDebateId] || []) : [];

  const createDebate = async () => {
    if (!authUser) return;
    const debateId = Date.now().toString();
    const newDoc = doc(collection(db, 'debates'), debateId);
    
    try {
      await setDoc(newDoc, {
        title: 'NOUVEAU DÉBAT...',
        createdAt: Date.now(),
        status: 'Ouvert',
        ownerId: authUser.uid
      });
      setActiveDebateId(debateId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'debates');
    }
  };

  const updateActiveDebate = async (updates: Partial<Debate>) => {
    if (!activeDebateId || !authUser) return;
    
    try {
      const debateRef = doc(db, 'debates', activeDebateId);
      const safeUpdates: any = {};
      if (updates.title !== undefined) safeUpdates.title = updates.title;
      if (updates.status !== undefined) safeUpdates.status = updates.status;
      if (updates.conclusion !== undefined) safeUpdates.conclusion = updates.conclusion;
      
      await updateDoc(debateRef, safeUpdates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `debates/${activeDebateId}`);
    }
  };

  const addStatement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeDebateId || !authUser) return;
    
    const form = e.currentTarget;
    const authorName = (form.elements.namedItem('author') as HTMLSelectElement).value;
    const text = (form.elements.namedItem('text') as HTMLInputElement).value;

    if (!text.trim()) return;

    try {
      const statementId = Date.now().toString() + Math.random().toString(36).substring(7);
      const statementRef = doc(db, `debates/${activeDebateId}/statements`, statementId);
      await setDoc(statementRef, {
        authorId: authUser.uid,
        authorName,
        text,
        timestamp: Date.now(),
        submitterName: authUser.displayName,
        revocations: []
      });
      form.reset();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `debates/${activeDebateId}/statements`);
    }
  };

  const handleRevoke = async (statement: Statement) => {
    if (!authUser || !activeDebateId) return;
    const currentRevocations = statement.revocations || [];
    if (currentRevocations.includes(authUser.uid)) return;
    
    const newRevocations = [...currentRevocations, authUser.uid];
    const statementRef = doc(db, `debates/${activeDebateId}/statements`, statement.id);
    
    try {
      if (newRevocations.length >= 2) {
        await deleteDoc(statementRef);
      } else {
        await updateDoc(statementRef, { revocations: arrayUnion(authUser.uid) });
      }
    } catch(err) {
      handleFirestoreError(err, OperationType.UPDATE, `debates/${activeDebateId}/statements`);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!loginName.trim()) {
      setAuthError('Veuillez entrer un prénom.');
      return;
    }
    const emailToUse = `${loginName.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}@dohitala.app`;
    try {
      if (isSignUp) {
        const userCred = await createUserWithEmailAndPassword(auth, emailToUse, loginPassword);
        await updateProfile(userCred.user, { displayName: loginName.trim() });
        setAuthUser({ ...userCred.user, displayName: loginName.trim() } as FirebaseUser);
        
        if (!friends.includes(loginName.trim())) {
          const newFriends = [loginName.trim(), ...friends];
          setFriends(newFriends);
          localStorage.setItem('friends', JSON.stringify(newFriends));
        }
      } else {
        await signInWithEmailAndPassword(auth, emailToUse, loginPassword);
      }
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential') {
        setAuthError('Prénom ou mot de passe incorrect.');
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError('Ce prénom est déjà pris. Veuillez vous connecter ou choisir un autre prénom.');
      } else {
        setAuthError(error.message || 'Une erreur est survenue.');
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setLoginPassword('');
    setLoginName('');
  };

  const shareOnWhatsApp = () => {
    if (!activeDebate) return;
    let text = ` *DÉBAT: ${activeDebate.title}* \n\n`;
    activeStatements.forEach(s => {
       text += `- *${s.authorName}*: "${s.text}"\n`;
    });
    if (activeDebate.status === 'Résolu') {
       text += `\n *VERDICT*: ${activeDebate.conclusion || 'Le débat a été acté.'}`;
    } else {
       text += `\n *STATUT*: Toujours en cours !`;
    }
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (!authUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f0f0f0] text-black font-sans selection:bg-rose-400 p-4">
        <div className="w-full max-w-sm bg-white border-4 border-black p-8 shadow-[12px_12px_0_0_rgba(0,0,0,1)] relative">
          <Triangle className="absolute -top-6 -right-6 w-12 h-12 fill-yellow-400 rotate-12 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]" />
          <Circle className="absolute -bottom-6 -left-6 w-12 h-12 fill-rose-400 drop-shadow-[4px_4px_0_rgba(0,0,0,1)]" />
          
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-black font-display uppercase tracking-widest flex items-center justify-center gap-2">
              <Triangle className="w-8 h-8 fill-black" strokeWidth={3} />
              DohiTala
            </h1>
            <p className="font-bold text-xs mt-2 uppercase tracking-wider border-b-4 border-black pb-2 inline-block">
              {isSignUp ? 'Créer un compte' : 'Se connecter'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            {authError && (
              <div className="bg-rose-400 border-4 border-black p-3 text-sm font-bold shadow-[4px_4px_0_0_rgba(0,0,0,1)] text-white">
                {authError}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="font-bold uppercase text-sm flex items-center gap-2"><User className="w-4 h-4"/> Ton Prénom</label>
              <input 
                type="text" 
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className="w-full bg-neutral-100 border-4 border-black p-3 font-bold uppercase rounded-none focus:outline-none focus:ring-0 shadow-[4px_4px_0_0_rgba(0,0,0,1)] focus:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all placeholder:text-neutral-300"
                placeholder="EX: THOMAS"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="font-bold uppercase text-sm flex items-center gap-2"><Lock className="w-4 h-4"/> Mot de passe</label>
              <input 
                type="password" 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-neutral-100 border-4 border-black p-3 font-bold rounded-none focus:outline-none focus:ring-0 shadow-[4px_4px_0_0_rgba(0,0,0,1)] focus:shadow-[6px_6px_0_0_rgba(0,0,0,1)] transition-all placeholder:text-neutral-300"
                placeholder="••••••••"
                required
              />
            </div>
            
            <button 
              type="submit"
              className="w-full mt-2 flex items-center justify-center gap-2 bg-rose-400 hover:bg-rose-500 text-black border-4 border-black px-4 py-4 font-black font-display uppercase tracking-widest transition-all shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              {isSignUp ? 'CRÉER' : 'ENTRER'} <ArrowRight className="w-5 h-5" strokeWidth={3}/>
            </button>

            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }}
              className="w-full text-center font-bold text-sm underline mt-4 hover:text-rose-500 cursor-pointer block"
            >
              {isSignUp ? 'Déjà un compte ? Connecte-toi' : 'Pas de compte ? Inscris-toi'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-[#f0f0f0] text-black font-sans selection:bg-rose-400 selection:text-black relative overflow-hidden">
      
      {/* LEFT SIDEBAR - DEBATE LIST */}
      <div className={`${activeDebateId ? 'hidden md:flex' : 'flex'} w-full md:w-80 bg-white border-r-4 border-black flex-col z-20 shadow-[4px_0_0_0_rgba(0,0,0,1)] relative shrink-0`}>
        <div className="p-6 pb-4 border-b-4 border-black bg-yellow-400 relative">
          <h1 className="text-3xl font-black font-display uppercase tracking-widest flex items-center gap-2">
            <Triangle className="w-8 h-8 fill-black text-black" strokeWidth={3} />
            DohiTala
          </h1>
          <p className="font-bold text-sm mt-1 uppercase tracking-wider flex items-center gap-2" title={authUser.email || ''}>
            <User className="w-4 h-4" /> {authUser.displayName || 'Utilisateur'}
          </p>
          <button 
            onClick={handleLogout}
            className="absolute top-6 right-6 p-1.5 bg-white border-2 border-black rounded-none shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:bg-rose-400 active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            title="Se déconnecter"
          >
            <LogOut className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
        
        <div className="bg-white border-b-4 border-black">
          {/* STATS */}
          <div className="flex border-b-4 border-black">
            <div className="flex-1 py-3 flex flex-col items-center justify-center border-r-4 border-black bg-blue-300 relative overflow-hidden group">
              <Square className="absolute -right-2 -bottom-2 w-8 h-8 fill-black opacity-10 rotate-12 transition-transform group-hover:rotate-45" />
              <span className="text-3xl font-black font-display leading-none">{debates.length}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Total</span>
            </div>
            <div className="flex-1 py-3 flex flex-col items-center justify-center bg-emerald-400 relative overflow-hidden group">
              <Circle className="absolute -left-2 -bottom-2 w-8 h-8 fill-black opacity-10 transition-transform group-hover:scale-125" />
              <span className="text-3xl font-black font-display leading-none">{debates.filter(d => d.status === 'Résolu').length}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Résolus</span>
            </div>
          </div>
          
          {/* NEW DEBATE BUTTON */}
          <div className="p-4 bg-neutral-100">
            <button 
              onClick={createDebate}
              className="w-full flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 active:translate-y-1 active:translate-x-1 active:shadow-none text-white px-4 py-3 border-4 border-black shadow-[4px_4px_0_0_rgba(251,113,133,1)] hover:shadow-none font-bold uppercase tracking-wider transition-all rounded-none"
            >
              <Plus className="w-6 h-6" strokeWidth={3} />
              NOUVEAU DÉBAT
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
          {debates.length === 0 ? (
            <div className="text-center font-bold text-black border-4 border-dashed border-black p-6 mt-4">
              AUCUN DÉBAT.<br/>LANCEZ LES HOSTILITÉS !
            </div>
          ) : (
            debates.map(debate => (
              <button
                key={debate.id}
                onClick={() => setActiveDebateId(debate.id)}
                className={`w-full text-left p-4 border-4 border-black transition-all ${
                  activeDebateId === debate.id 
                    ? 'bg-rose-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1 -translate-x-1' 
                    : 'bg-white hover:bg-neutral-100 shadow-[2px_2px_0_0_rgba(0,0,0,1)]'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs px-2 py-1 border-2 border-black font-bold uppercase ${
                    debate.status === 'Ouvert' ? 'bg-emerald-400' : 'bg-neutral-300'
                  }`}>
                    {debate.status}
                  </span>
                  <span className="text-xs font-bold flex items-center gap-1 border-b-2 border-black pb-0.5">
                    <Clock className="w-3 h-3" strokeWidth={3} />
                    {new Date(debate.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="font-black font-display text-lg uppercase truncate tracking-tight">
                  {debate.title}
                </h3>
                <p className="text-sm font-bold mt-2 flex items-center gap-1 border-t-2 border-black pt-2">
                  <MessageSquare className="w-4 h-4 fill-black" />
                  {(statements[debate.id] || []).length} CITATION(S)
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT MAIN AREA - DEBATE DETAILS */}
      <div className={`${activeDebateId ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-[#f0f0f0] overflow-hidden absolute inset-0 md:static z-30 md:z-10`}>
        {activeDebate ? (
          <>
            {/* Header / Title area */}
            <div className="bg-white border-b-4 border-black p-4 sm:p-8 shadow-[0_4px_0_0_rgba(0,0,0,1)] z-10 shrink-0">
              <div className="max-w-4xl mx-auto">
                <button 
                  onClick={() => setActiveDebateId(null)}
                  className="md:hidden flex items-center gap-2 mb-4 font-bold border-2 border-black px-3 py-1.5 text-xs bg-neutral-100 hover:bg-neutral-200 shadow-[2px_2px_0_0_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none uppercase"
                >
                  <ArrowLeft className="w-4 h-4" strokeWidth={2} /> Retour à la liste
                </button>

                <input 
                  type="text" 
                  value={activeDebate.title}
                  onChange={(e) => updateActiveDebate({ title: e.target.value })}
                  className="text-2xl sm:text-4xl md:text-5xl font-black font-display uppercase tracking-tighter bg-transparent border-none outline-none w-full text-black placeholder:text-neutral-300 focus:ring-0 p-0 mb-4"
                  placeholder="SUJET DU DÉBAT..."
                />
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
                  <button 
                    onClick={() => updateActiveDebate({ status: activeDebate.status === 'Ouvert' ? 'Résolu' : 'Ouvert' })}
                    className={`flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2 border-4 border-black font-bold uppercase transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none text-[10px] sm:text-xs md:text-sm flex-1 sm:flex-none ${
                      activeDebate.status === 'Ouvert' 
                        ? 'bg-emerald-400 hover:bg-emerald-500' 
                        : 'bg-neutral-300 hover:bg-neutral-400'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 bg-white rounded-full border-2 border-black shrink-0" />
                    <span className="whitespace-nowrap">{activeDebate.status === 'Ouvert' ? 'MARQUER RÉSOLU' : 'ROUVRIR'}</span>
                  </button>

                  <button
                    onClick={shareOnWhatsApp}
                    className="flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2 border-4 border-black font-bold uppercase transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none bg-[#25D366] hover:bg-[#20bd5a] text-black shrink-0 text-[10px] sm:text-xs md:text-sm"
                    title="Partager sur WhatsApp"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                    </svg>
                    <span className="hidden sm:inline">WhatsApp</span>
                  </button>

                  <span className="font-bold border-b-4 border-black text-xs sm:text-sm mt-3 sm:mt-0 w-full sm:w-auto sm:ml-auto">
                    CRÉÉ LE {new Date(activeDebate.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative">
              <div className="max-w-4xl mx-auto space-y-10">
                
                {/* Statements List */}
                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-[1px] md:before:mx-auto md:before:translate-x-0 before:h-full before:w-[2px] before:bg-black">
                  {activeStatements.length === 0 && (
                    <div className="text-center py-12 font-bold uppercase border-4 border-black border-dashed bg-white max-w-lg mx-auto relative z-10">
                      LA SCÈNE EST VIDE. AJOUTEZ UNE CITATION CI-DESSOUS.
                    </div>
                  )}
                  {activeStatements.map((statement, idx) => {
                    const isEven = idx % 2 === 0;
                    const shapes = [
                      <Circle className="w-6 h-6 fill-rose-400" />,
                      <Square className="w-6 h-6 fill-yellow-400" />,
                      <Triangle className="w-6 h-6 fill-blue-400" />
                    ];
                    const Shape = shapes[idx % shapes.length];

                    return (
                      <div key={statement.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group z-10">
                        {/* Center Icon on timeline */}
                        <div className="flex items-center justify-center w-10 h-10 border-2 border-black bg-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] shrink-0 z-10 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 rounded-none">
                          {Shape}
                        </div>
                        
                        <div className="w-[calc(100%-3.5rem)] md:w-[calc(50%-4rem)] p-4 md:p-6 border-2 border-black bg-white shadow-[4px_4px_0_0_rgba(0,0,0,1)] relative transition-transform hover:-translate-y-1">
                          {/* Triangle pointer connecting box to timeline line */}
                          <div className={`hidden md:block absolute top-1/2 -mt-2 w-3 h-3 bg-white border-t-2 border-r-2 border-black transform rotate-45 ${
                            isEven ? 'left-full -ml-[7px]' : 'right-full -mr-[7px] scale-x-[-1]'
                          }`}></div>

                          <div className="flex justify-between items-center mb-3 pb-2 border-b-2 border-black">
                            <div className="flex flex-col md:flex-row md:items-center gap-2">
                              <span className="font-bold font-display text-sm md:text-base uppercase bg-yellow-200 px-2 border-2 border-black truncate max-w-[120px] md:max-w-none">{statement.authorName}</span>
                              {statement.submitterName && statement.submitterName !== statement.authorName && (
                                <span className="text-[10px] font-bold uppercase text-neutral-500">
                                  (Cité par {statement.submitterName})
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold border-l-2 border-black pl-2 text-neutral-500 whitespace-nowrap">
                              {new Date(statement.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-neutral-900 leading-relaxed font-sans text-base break-words mb-3">
                            "{statement.text}"
                          </p>
                          <div className="flex justify-end pt-2 border-t-2 border-dashed border-neutral-300">
                            <button
                              onClick={() => handleRevoke(statement)}
                              disabled={statement.revocations?.includes(authUser?.uid || '')}
                              className={`text-[10px] font-bold uppercase px-2 py-1 border-2 border-black transition-all ${
                                statement.revocations?.includes(authUser?.uid || '') 
                                  ? 'bg-neutral-200 text-neutral-400 border-neutral-300 cursor-not-allowed'
                                  : 'bg-white hover:bg-rose-100 text-rose-500 shadow-[2px_2px_0_0_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none'
                              }`}
                            >
                              {statement.revocations?.includes(authUser?.uid || '') ? 'Révoqué' : 'Révoquer'} ({statement.revocations?.length || 0}/2)
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Conclusion Box */}
                {(activeDebate.status === 'Résolu' || activeDebate.conclusion) && (
                  <div className="mt-16 bg-yellow-300 border-4 border-black p-8 relative z-10 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
                    <h4 className="flex items-center gap-3 font-black font-display text-2xl uppercase mb-4 border-b-4 border-black pb-2">
                      <Save className="w-8 h-8 fill-black" strokeWidth={2} />
                      CONCLUSION / VERDICT
                    </h4>
                    {activeDebate.status === 'Résolu' ? (
                      <textarea
                        value={activeDebate.conclusion}
                        onChange={(e) => updateActiveDebate({ conclusion: e.target.value })}
                        placeholder="QUEL A ÉTÉ LE FIN MOT DE L'HISTOIRE ?"
                        className="w-full bg-white border-4 border-black font-bold p-4 focus:outline-none focus:ring-0 min-h-[120px] resize-y placeholder:text-neutral-400 shadow-[inset_4px_4px_0_0_rgba(0,0,0,0.1)]"
                      />
                    ) : (
                      <p className="text-black font-bold text-lg bg-white border-4 border-black p-4 shadow-[inset_4px_4px_0_0_rgba(0,0,0,0.1)]">
                        {activeDebate.conclusion}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Input Area (Only if open) */}
            {activeDebate.status === 'Ouvert' && (
              <div className="bg-white border-t-4 border-black p-4 sm:p-6 pb-6 sm:pb-6 z-20 shadow-[0_-4px_0_0_rgba(0,0,0,1)] shrink-0">
                <form onSubmit={addStatement} className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-4">
                  <select 
                    name="author"
                    defaultValue={authUser.displayName || 'Moi'} 
                    className="bg-neutral-100 border-2 border-black text-black font-bold uppercase rounded-none focus:outline-none focus:ring-0 p-3 min-w-[140px] shadow-[2px_2px_0_0_rgba(0,0,0,1)] focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all text-sm md:text-base"
                  >
                    {Array.from(new Set([authUser.displayName || 'Moi', ...friends, ...Object.values(statements).flat().map(s => s.authorName)])).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  
                  <input
                    type="text"
                    name="text"
                    placeholder="QU'EST-CE QUI A ÉTÉ DIT EXACTEMENT ?..."
                    autoComplete="off"
                    className="flex-1 bg-neutral-100 border-2 border-black text-black font-medium rounded-none focus:outline-none focus:ring-0 px-4 py-3 shadow-[2px_2px_0_0_rgba(0,0,0,1)] focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] placeholder:text-neutral-400 transition-all"
                  />
                  
                  <button 
                    type="submit"
                    className="bg-black hover:bg-neutral-800 text-white border-2 border-black px-6 py-3 font-bold font-display uppercase tracking-wider transition-all shadow-[2px_2px_0_0_rgba(0,0,0,1)] shadow-rose-400 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none whitespace-nowrap"
                  >
                    AJOUTER
                  </button>
                </form>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-yellow-400 border-l-4 border-t-4 border-b-4 border-black m-8 shadow-[12px_12px_0_0_rgba(0,0,0,1)]">
            <Triangle className="w-24 h-24 mb-6 fill-black" />
            <h2 className="text-4xl font-black font-display uppercase tracking-tight text-center px-4">
              DOHITALA EST PRÊT
            </h2>
            <p className="text-xl font-bold mt-4 border-4 border-black bg-white px-6 py-2 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
              SÉLECTIONNEZ UN DÉBAT
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
