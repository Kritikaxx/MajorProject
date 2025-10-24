import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
// Use type-only imports for module types to satisfy strict TypeScript configs
import type { User } from 'firebase/auth'; 
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    signOut
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore'; // Use type-only import for Firestore
import { 
    getFirestore, 
    setLogLevel 
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
    RefreshCw
} from 'lucide-react';
import './App.css'; // Importing the standard CSS file

// --- 1. GLOBAL ENVIRONMENT SETUP & TYPE DECLARATIONS ---
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config || '{}') : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

setLogLevel('debug'); // Enable detailed Firebase logging

// --- 2. AUTH & FIREBASE CONTEXT/SETUP HOOK ---
const useFirebase = () => {
    const [auth, setAuth] = useState<ReturnType<typeof getAuth> | null>(null);
    const [db, setDb] = useState<Firestore | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null | undefined>(undefined); 

    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase configuration is missing.");
            setCurrentUser(null);
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);

            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                setCurrentUser(user);
            });

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
            };

            if (currentUser === undefined) {
                initialSignIn();
            }
            
            return () => unsubscribe();
        } catch (e) {
            console.error("Failed to initialize Firebase:", e);
            setCurrentUser(null);
        }
    }, []); 

    const userId = currentUser ? currentUser.uid : `anon-${appId}-${crypto.randomUUID()}`;

    return { auth, db, currentUser, userId, isLoading: currentUser === undefined };
};

// --- 3. UI COMPONENTS ---

// User Profile Menu (Dropdown)
interface ProfileMenuProps {
    // FIX APPLIED: Allow undefined to match the return type of useFirebase hook
    user: User | null | undefined; 
    onSignOut: () => void;
}
const ProfileMenu: React.FC<ProfileMenuProps> = ({ user, onSignOut }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => setIsOpen(!isOpen);

    const handleAction = (action: 'login' | 'signup' | 'details' | 'logout') => {
        setIsOpen(false);
        switch (action) {
            case 'login':
            case 'signup':
                console.log(`[ACTION] Simulating navigation to ${action} page.`);
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
            <UserAvatar />
            
            {/* We check for user existence AND if they are NOT anonymous */}
            {isOpen && (
                <div 
                    onBlur={() => setIsOpen(false)}
                    tabIndex={0} 
                    className="profile-dropdown"
                >
                    {user && !user.isAnonymous ? (
                        <div className="dropdown-content">
                            <p className="dropdown-user-welcome">
                                Welcome, Authenticated User!
                            </p>
                            <p className="dropdown-user-id">
                                ID: {user.uid}
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


// Theme Toggle
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


// Main Dashboard Header Component
interface HeaderProps {
    theme: 'light' | 'dark';
    onThemeToggle: () => void;
    user: User | null | undefined; 
    onSignOut: () => void;
}
const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle, user, onSignOut }) => (
    <header className={`app-header ${theme}-theme`}>
        <div className="header-content-wrapper">
            
            {/* Left Section: Logo Space */}
            <div className="header-left">
                <div className="app-logo">
                    UC
                </div>
                <h1 className="app-title">
                    University Doc Center
                </h1>
            </div>

            {/* Right Section: Actions */}
            <div className="header-right">
                
                {/* Search Bar */}
                <div className="search-container">
                    <input
                        type="search"
                        placeholder="Search templates or documents..."
                        className="search-input"
                    />
                    <Search className="search-icon" />
                </div>
                
                <ThemeToggle theme={theme} onToggle={onThemeToggle} />
                
                <ProfileMenu user={user} onSignOut={onSignOut} />
            </div>
        </div>
    </header>
);

// --- 4. MAIN APP COMPONENT ---

function App() {
    const { auth, currentUser, userId, isLoading } = useFirebase();
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    // Theme logic (attaching dark class to body)
    useEffect(() => {
        const root = window.document.documentElement;
        const body = window.document.body;
        
        // Ensure no redundant classes are present
        root.classList.remove('light', 'dark');
        body.classList.remove('light', 'dark');

        // Apply current theme class
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
                console.log("User signed out successfully.");
                
                if (initialAuthToken) {
                     await signInWithCustomToken(auth, initialAuthToken);
                } else {
                     await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Sign out error:", error);
            }
        }
    };
    
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

    return (
        <div className="app-container">
            
            <Header 
                theme={theme} 
                onThemeToggle={toggleTheme} 
                user={currentUser} 
                onSignOut={handleSignOut} 
            />

            {/* Main Content Area */}
            <main className="main-content-area">
                <div className="main-grid">
                    
                    {/* Sidebar / Navigation */}
                    <aside className="sidebar">
                        <h2 className="sidebar-title">
                            Document Categories
                        </h2>
                        <ul className="sidebar-list">
                            {['Appointment Letters', 'Leave Forms', 'Policy Documents', 'History Logs'].map(item => (
                                <li key={item}>
                                    <a 
                                        href="#" 
                                        className="sidebar-link"
                                    >
                                        <Menu className="icon-xs" style={{marginRight: '12px'}} />
                                        {item}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    {/* Dashboard Content Panel */}
                    <section className="dashboard-panel">
                        <h2 className="panel-title">
                            Available Templates
                        </h2>
                        <p className="panel-description">
                            This is where your document templates will be listed. Click one to open the rich text editor, modify the content, save the new document, and download it.
                        </p>
                        
                        <div className="template-grid">
                            {[
                                { title: 'Appointment Letter Template (Editable)', description: 'Standard format for new staff or faculty.' },
                                { title: 'Internship Offer (Editable)', description: 'Template for student intern offers.' },
                                { title: 'Equipment Request Form', description: 'Internal form for center supplies.' },
                            ].map((card, index) => (
                                <div key={index} className="template-card">
                                    <h3 className="card-title">{card.title}</h3>
                                    <p className="card-description">{card.description}</p>
                                    <button className="card-button">
                                        Open Editor
                                    </button>
                                </div>
                            ))}
                        </div>

                         <div className="user-status-box">
                            <h3 className="user-status-title">Current User Status</h3>
                            <p className="user-status-text">
                                Logged in as: 
                                <span className="user-id-display">
                                    {userId}
                                </span>
                            </p>
                        </div>

                    </section>
                </div>
            </main>
        </div>
    );
}

export default App;
