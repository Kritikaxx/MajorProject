import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
// Use type-only imports for module types to satisfy strict TypeScript configs
import type { User } from 'firebase/auth'; 
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    signOut,
    createUserWithEmailAndPassword, // For Sign Up
    signInWithEmailAndPassword      // For Log In
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore'; 
import { 
    getFirestore, 
    setLogLevel,
    doc,
    setDoc,
    collection,
    query,
    getDocs,
    orderBy,
    limit,
    serverTimestamp // For tracking creation time
} from 'firebase/firestore';
import { 
    Search, 
    Sun, 
    Moon, 
    User as UserIcon, 
    LogOut, 
    LogIn, 
    BookOpen, 
    Menu,
    RefreshCw,
    Save
} from 'lucide-react';
import './App.css'; 

// --- 1. GLOBAL ENVIRONMENT SETUP & TYPE DECLARATIONS ---
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;

const APP_DOMAIN = '@kiit.ac.in';

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// This is the structure to read keys from the .env file (VITE_ prefix required by Vite)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

setLogLevel('debug'); 

// --- 2. AUTH & FIREBASE CONTEXT/SETUP HOOK (FIXED) ---
const useFirebase = () => {
    const [auth, setAuth] = useState<ReturnType<typeof getAuth> | null>(null);
    const [db, setDb] = useState<Firestore | null>(null);
    // undefined: Loading/Initial State; null: Logged Out; User: Logged In
    const [currentUser, setCurrentUser] = useState<User | null | undefined>(undefined); 

    useEffect(() => {
        if (!firebaseConfig.apiKey) {
            console.error("Firebase configuration is missing API Key. Check your .env.local file.");
            setCurrentUser(null);
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);

            setAuth(authInstance);
            setDb(dbInstance);

            let initialUserCheck = true;

            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                setCurrentUser(user);
                
                // If the user state changes (e.g., after login/logout), we stop anonymous sign-in attempts
                if (!initialUserCheck) {
                    return;
                }

                // If the app is loading AND no user is present, attempt initial sign-in (anonymous or custom token)
                if (initialUserCheck && user === null) {
                     const initialSignIn = async () => {
                        try {
                            if (initialAuthToken) {
                                await signInWithCustomToken(authInstance, initialAuthToken);
                            } else {
                                await signInAnonymously(authInstance);
                            }
                        } catch (error) {
                            console.error("Firebase initial sign-in failed:", error);
                            setCurrentUser(null); 
                        }
                        initialUserCheck = false; // Prevent repeated sign-in attempts
                    };
                    initialSignIn();
                }

                if (user !== undefined) {
                    initialUserCheck = false; // Stop initial attempts once we get a clear status
                }
            });
            
            return () => unsubscribe();
        } catch (e) {
            console.error("Failed to initialize Firebase:", e);
            setCurrentUser(null);
        }
    }, []); 

    const userId = currentUser ? currentUser.uid : `anon-${appId}-${crypto.randomUUID()}`;

    return { auth, db, currentUser, userId, isLoading: currentUser === undefined };
};

// --- 3. CORE LOGIC FUNCTIONS ---

interface DocumentData {
    id: string;
    title: string;
    description: string;
    content: string;
    editor: 'Placeholder';
    createdAt: any;
    userId: string;
}

const saveDocument = async (db: Firestore, userId: string, templateId: string, templateTitle: string, content: string): Promise<void> => {
    if (!db || !userId) {
        console.error("Database or User ID is unavailable.");
        return;
    }

    try {
        const docId = `${templateId}-${Date.now()}`;
        // Path: /artifacts/{appId}/users/{userId}/documents/{docId}
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'documents', docId);

        const documentData: DocumentData = {
            id: docId,
            title: templateTitle,
            description: `Generated from template ${templateId}`,
            content: content,
            editor: 'Placeholder', 
            createdAt: serverTimestamp(),
            userId: userId,
        };

        await setDoc(docRef, documentData);
        console.log("Document saved successfully with ID:", docId);
        alert(`Document "${templateTitle}" saved successfully! ID: ${docId}`);

    } catch (e) {
        console.error("Error saving document: ", e);
        alert("Failed to save document. Check console for details.");
    }
};

const fetchHistory = async (db: Firestore, userId: string): Promise<DocumentData[] | null> => {
    if (!db || !userId) {
        console.error("Database or User ID is unavailable for history fetch.");
        return null;
    }

    try {
        const documentsRef = collection(db, 'artifacts', appId, 'users', userId, 'documents');
        // Fetch the last 10 documents by creation time
        const q = query(documentsRef, orderBy('createdAt', 'desc'), limit(10));
        
        const querySnapshot = await getDocs(q);
        const history: DocumentData[] = [];
        querySnapshot.forEach((doc) => {
            history.push(doc.data() as DocumentData);
        });
        
        return history;
    } catch (e) {
        console.error("Error fetching history: ", e);
        return null;
    }
};


// --- 4. AUTH MODAL COMPONENT ---

interface AuthModalProps {
    auth: ReturnType<typeof getAuth> | null;
    isVisible: boolean;
    onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ auth, isVisible, onClose }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isVisible) {
            // Reset state when modal opens
            setIsLogin(true);
            setEmail('');
            setPassword('');
            setError(null);
        }
    }, [isVisible]);

    if (!isVisible) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email.endsWith(APP_DOMAIN)) {
            setError(`Only ${APP_DOMAIN} emails are allowed.`);
            return;
        }

        if (!auth) {
            setError("Authentication service is not ready.");
            return;
        }

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
                console.log("Login successful.");
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
                console.log("Sign up successful.");
            }
            onClose(); // Close modal on success
        } catch (e: any) {
            // Handle Firebase-specific errors
            setError(`Authentication Failed: ${e.code.replace('auth/', '').replace(/-/g, ' ')}`);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="auth-modal" onClick={e => e.stopPropagation()}>
                <h3 className="modal-title">{isLogin ? 'Log In' : 'Sign Up'}</h3>
                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <p className="auth-error">{error}</p>}
                    
                    <input
                        type="email"
                        placeholder={`Email (e.g., user${APP_DOMAIN})`}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="auth-input"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="auth-input"
                    />
                    <button type="submit" className="auth-submit-btn">
                        {isLogin ? 'Log In' : 'Sign Up'}
                    </button>
                </form>

                <p className="auth-footer">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button type="button" onClick={() => setIsLogin(!isLogin)} className="auth-toggle-btn">
                        {isLogin ? 'Sign Up' : 'Log In'}
                    </button>
                </p>
                <button onClick={onClose} className="modal-close-btn">&times;</button>
            </div>
        </div>
    );
};


// --- 5. DOCUMENT EDITOR COMPONENT ---

interface DocumentEditorProps {
    db: Firestore | null;
    userId: string;
    template: Template;
    onViewHistory: () => void;
    onBack: () => void;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({ db, userId, template, onViewHistory, onBack }) => {
    // Placeholder for the Rich Text Editor content
    const [content, setContent] = useState(template.initialContent); 
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        // Prevent saving if the user is anonymous
        if (userId.startsWith('anon-')) {
            alert("Please log in or sign up with a KIIT email to save documents.");
            return;
        }
        
        setIsSaving(true);
        if (db) {
            await saveDocument(db, userId, template.id, template.title, content);
        }
        setIsSaving(false);
    };

    return (
        <div className="editor-container">
            <div className="editor-header">
                <h2 className="editor-title">Editing: {template.title}</h2>
                <div className="editor-actions">
                    <button onClick={onBack} className="editor-action-btn editor-back-btn">
                        &larr; Back to Templates
                    </button>
                    <button onClick={onViewHistory} className="editor-action-btn editor-history-btn">
                        View History
                    </button>
                    <button onClick={handleSave} disabled={isSaving || userId.startsWith('anon-')} className={`editor-action-btn editor-save-btn ${userId.startsWith('anon-') ? 'disabled-btn' : ''}`}>
                        <Save className="icon-xs" style={{marginRight: '8px'}} />
                        {isSaving ? 'Saving...' : 'Save Document'}
                    </button>
                </div>
            </div>
            
            {/* Placeholder for the Rich Text Editor */}
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="rich-text-editor-placeholder"
                placeholder="[Rich Text Editor Placeholder] Edit your document content here..."
            />
            
            <p className="editor-note">
                NOTE: This textarea should be replaced by a Rich Text Editor (e.g., Quill, TinyMCE) 
                to support formatting for your official documents.
            </p>
        </div>
    );
};


// --- 6. TEMPLATE LIST COMPONENT ---

interface Template {
    id: string;
    title: string;
    description: string;
    initialContent: string;
}

const TEMPLATES: Template[] = [
    { id: 'app_ltr', title: 'Appointment Letter Template', description: 'Standard format for new staff or faculty.', initialContent: "Dear [Name],\nWe are pleased to offer you the position of [Title] at the KIIT Activity Centre..." },
    { id: 'leave_form', title: 'Leave Application Form', description: 'Internal form for staff leave requests.', initialContent: "This is a request for leave from [Date] to [Date]..." },
    { id: 'equip_req', title: 'Equipment Request Form', description: 'Internal form for center supplies.', initialContent: "Item: [Item Name], Quantity: [Number], Justification: [Reason]..." },
];

interface TemplateListProps {
    onSelectTemplate: (template: Template) => void;
}

const TemplateList: React.FC<TemplateListProps> = ({ onSelectTemplate }) => (
    <div className="template-list-panel">
        <h2 className="panel-title">Available Templates</h2>
        <p className="panel-description">
            Select a template below to open the editor, modify the content, save the new document, and download it.
        </p>
        
        <div className="template-grid">
            {TEMPLATES.map((card) => (
                <div key={card.id} className="template-card">
                    <h3 className="card-title">{card.title}</h3>
                    <p className="card-description">{card.description}</p>
                    <button onClick={() => onSelectTemplate(card)} className="card-button">
                        Open Editor
                    </button>
                </div>
            ))}
        </div>
    </div>
);

// --- 7. MAIN APP COMPONENT ---

type ActiveView = 'list' | 'editor' | 'history';

function App() {
    const { auth, db, currentUser, userId, isLoading } = useFirebase();
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [isAuthModalVisible, setIsAuthModalVisible] = useState(false); // Modal state
    const [activeView, setActiveView] = useState<ActiveView>('list'); // Dashboard view state
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null); // Template state
    const [historyData, setHistoryData] = useState<DocumentData[] | null>(null); // History state

    // Theme logic (attaching dark class to body)
    useEffect(() => {
        const root = window.document.documentElement;
        const body = window.document.body;
        
        root.classList.remove('light', 'dark');
        body.classList.remove('light', 'dark');

        root.classList.add(theme);
        body.classList.add(theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(currentTheme => (currentTheme === 'light' ? 'dark' : 'light'));
    };

    const handleSignOut = async () => {
        if (auth) {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Sign out error:", error);
            }
        }
    };

    const handleViewHistory = async () => {
        if (db && currentUser && !currentUser.isAnonymous) {
            const data = await fetchHistory(db, currentUser.uid);
            setHistoryData(data);
            setActiveView('history');
        } else {
            alert("Please log in with your KIIT email to view document history.");
        }
    };

    const handleSelectTemplate = (template: Template) => {
        setSelectedTemplate(template);
        setActiveView('editor');
    };
    
    // --- Render Logic ---

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="loading-indicator">
                    <RefreshCw className="icon-sm loading-spinner" />
                    <span>Loading Authentication...</span>
                </div>
            </div>
        );
    }

    let mainContent;
    
    switch (activeView) {
        case 'editor':
            mainContent = selectedTemplate ? (
                <DocumentEditor
                    db={db}
                    // Use currentUser.uid if authenticated, otherwise fallback to temporary userId
                    userId={currentUser ? currentUser.uid : userId} 
                    template={selectedTemplate}
                    onViewHistory={handleViewHistory}
                    onBack={() => setActiveView('list')}
                />
            ) : null;
            break;
        case 'history':
            mainContent = (
                <div className="history-panel">
                    <button onClick={() => setActiveView('list')} className="editor-action-btn editor-back-btn">&larr; Back to Templates</button>
                    <h2 className="panel-title">Document History</h2>
                    {historyData && historyData.length > 0 ? (
                        <ul className="history-list">
                            {historyData.map((doc, index) => (
                                <li key={index} className="history-item">
                                    <strong>{doc.title}</strong> (Saved: {new Date(doc.createdAt?.seconds * 1000).toLocaleString()})
                                    <p className="history-content-preview">{doc.content.substring(0, 100)}...</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="panel-description">No saved documents found in history. Log in with a KIIT email, save a document, and check back!</p>
                    )}
                </div>
            );
            break;
        case 'list':
        default:
            mainContent = <TemplateList onSelectTemplate={handleSelectTemplate} />;
            break;
    }

    // Determine if the user is truly logged in (not anonymous)
    const isAuthenticated = !!(currentUser && !currentUser.isAnonymous);

    return (
        <div className="app-container">
            
            <Header 
                theme={theme} 
                onThemeToggle={toggleTheme} 
                user={currentUser} 
                onSignOut={handleSignOut} 
                onLoginClick={() => setIsAuthModalVisible(true)} 
                isAuthenticated={isAuthenticated} 
            />

            {/* Auth Modal is rendered at the root level */}
            <AuthModal 
                auth={auth} 
                isVisible={isAuthModalVisible} 
                onClose={() => setIsAuthModalVisible(false)} 
            />

            {/* Main Content Area */}
            <main className="main-content-area">
                <div className="main-grid">
                    
                    {/* Sidebar / Navigation */}
                    <aside className="sidebar">
                        <h2 className="sidebar-title">Navigation</h2>
                        <ul className="sidebar-list">
                            <li>
                                <a href="#" onClick={() => setActiveView('list')} className="sidebar-link">
                                    <Menu className="icon-xs" style={{marginRight: '12px'}} />
                                    Template List
                                </a>
                            </li>
                            <li>
                                <a href="#" onClick={handleViewHistory} className="sidebar-link">
                                    <Menu className="icon-xs" style={{marginRight: '12px'}} />
                                    History Logs
                                </a>
                            </li>
                        </ul>
                    </aside>

                    {/* Dashboard Content Panel - Renders the active view */}
                    <section className="dashboard-panel">
                        {mainContent}
                        
                         {/* REMOVED: The entire Current Status (Debug Info) block */}

                    </section>
                </div>
            </main>
        </div>
    );
}

// --- 8. UI COMPONENTS ---

// Header (Updated to use isAuthenticated prop)
interface HeaderProps {
    theme: 'light' | 'dark';
    onThemeToggle: () => void;
    user: User | null | undefined; 
    onSignOut: () => void;
    onLoginClick: () => void;
    isAuthenticated: boolean | undefined; 
}
const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle, user, onSignOut, onLoginClick, isAuthenticated }) => (
    <header className={`app-header ${theme}-theme`}>
        <div className="header-content-wrapper">
            
            <div className="header-left">
                <div className="app-logo">UC</div>
                <h1 className="app-title">University Doc Center</h1>
            </div>

            <div className="header-right">
                <div className="search-container">
                    <input type="search" placeholder="Search templates or documents..." className="search-input"/>
                    <Search className="search-icon" />
                </div>
                
                <ThemeToggle theme={theme} onToggle={onThemeToggle} />
                
                {/* FIX: Conditional rendering to show EITHER the Button OR the Icon */}
                {isAuthenticated ? (
                    // 1. SHOW ONLY ICON IF AUTHENTICATED
                    <ProfileMenu user={user} onSignOut={onSignOut} onLoginClick={onLoginClick}/>
                ) : (
                    // 2. SHOW ONLY BUTTON IF NOT AUTHENTICATED
                    <button onClick={onLoginClick} className="login-signup-btn">
                        Log In / Sign Up
                    </button>
                )}
            </div>
        </div>
    </header>
);

// ProfileMenu (Updated to display user email)
interface ProfileMenuProps {
    user: User | null | undefined; 
    onSignOut: () => void;
    onLoginClick: () => void;
}
const ProfileMenu: React.FC<ProfileMenuProps> = ({ user, onSignOut, onLoginClick }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => setIsOpen(!isOpen);

    const handleAction = (action: 'login' | 'signup' | 'details' | 'logout') => {
        setIsOpen(false);
        switch (action) {
            case 'login':
            case 'signup':
                onLoginClick(); 
                break;
            case 'details':
                console.log("[ACTION] Simulating viewing user details.");
                break;
            case 'logout':
                onSignOut();
                break;
        }
    };

    const UserAvatar = () => (
        <button
            onClick={toggleMenu}
            className="user-avatar-btn"
            aria-expanded={isOpen}
            aria-label="User menu"
        >
            <UserIcon className="icon-sm" />
        </button>
    );

    return (
        <div className="profile-menu-container">
            {/* The avatar button is now always rendered here if this component is used */}
            <UserAvatar />
            
            {isOpen && (
                <div 
                    onBlur={() => setIsOpen(false)}
                    tabIndex={0} 
                    className="profile-dropdown"
                >
                    {/* Check if user is authenticated (not null AND not anonymous) */}
                    {user && !user.isAnonymous ? (
                        <div className="dropdown-content">
                            <p className="dropdown-user-welcome">
                                Welcome, {user.email}!
                            </p>
                            <button
                                onClick={() => handleAction('details')}
                                className="dropdown-item"
                            >
                                <UserIcon className="icon-xs" style={{marginRight: '8px'}} />
                                View Profile Details
                            </button>
                            <button
                                onClick={() => handleAction('logout')}
                                className="dropdown-item dropdown-logout-btn"
                            >
                                <LogOut className="icon-xs" style={{marginRight: '8px'}} />
                                Log Out
                            </button>
                        </div>
                    ) : (
                        // Show Login/Signup options if not authenticated
                        <div className="dropdown-content">
                            <button
                                onClick={() => handleAction('login')}
                                className="dropdown-item dropdown-login-btn"
                            >
                                <LogIn className="icon-xs" style={{marginRight: '8px'}} />
                                Log In
                            </button>
                            <button
                                onClick={() => handleAction('signup')}
                                className="dropdown-item"
                            >
                                <BookOpen className="icon-xs" style={{marginRight: '8px'}} />
                                Sign Up
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Theme Toggle (Unchanged)
interface ThemeToggleProps {
    theme: 'light' | 'dark';
    onToggle: () => void;
}
const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => (
    <button
        onClick={onToggle}
        className="theme-toggle-btn"
        aria-label={`Toggle to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
        {theme === 'light' ? (
            <Moon className="icon-sm moon-icon" />
        ) : (
            <Sun className="icon-sm sun-icon" />
        )}
    </button>
);


export default App;
