import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import type { User } from 'firebase/auth'; 
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword      
} from 'firebase/auth';
import { 
    getFirestore, 
    setLogLevel,
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
    FileText, 
    File, 
    Bold, 
    X, 
    Menu as MenuIcon,
    Save, 
    ChevronDown 
} from 'lucide-react';
import './App.css'; 

// PDF and DOCX Generation Imports
import html2pdf from 'html2pdf.js'; 
import { Document, Paragraph, TextRun, Packer } from "docx";
import { saveAs } from 'file-saver'; 

// --- 1. GLOBAL ENVIRONMENT SETUP ---
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;

const APP_DOMAIN = '@kiit.ac.in';

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

// --- GLOBAL INTERFACE DEFINITIONS ---
interface Template {
    id: string;
    title: string;
    description: string;
    initialContent: string;
}

// Interfaces used by components defined later
interface ProfileMenuProps {
    user: User | null | undefined; 
    onSignOut: () => void;
    onLoginClick: () => void;
}
interface HeaderProps {
    theme: 'light' | 'dark';
    onThemeToggle: () => void;
    user: User | null | undefined; 
    onSignOut: () => void;
    onLoginClick: () => void;
    isAuthenticated: boolean | undefined; 
    onMenuOpen: () => void;
    searchQuery: string; 
    onSearchChange: (query: string) => void;
}
interface ThemeToggleProps {
    theme: 'light' | 'dark';
    onToggle: () => void;
}
interface DocumentEditorProps {
    template: Template;
    onBack: () => void;
}
interface TemplateListProps {
    onSelectTemplate: (template: Template) => void;
    templates: Template[];
}
interface MobileSidebarProps {
    activeView: string;
    onSetActiveView: (view: 'list' | 'editor' | 'history') => void;
    onClose: () => void;
}
interface MenuButtonProps {
    onOpen: () => void;
}
interface SaveDropdownProps {
    onDownload: (format: 'docx' | 'pdf') => void;
}

// --- 2. AUTH & FIREBASE CONTEXT/SETUP HOOK ---
const useFirebase = () => {
    const [auth, setAuth] = useState<ReturnType<typeof getAuth> | null>(null);
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
            getFirestore(app); 

            setAuth(authInstance);

            let initialUserCheck = true;

            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                setCurrentUser(user);
                
                if (!initialUserCheck) {
                    return;
                }

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
                        initialUserCheck = false; 
                    };
                    initialSignIn();
                }

                if (user !== undefined) {
                    initialUserCheck = false; 
                }
            });
            
            return () => unsubscribe();
        } catch (e) {
            console.error("Failed to initialize Firebase:", e);
            setCurrentUser(null);
        }
    }, []); 

    return { auth, currentUser, isLoading: currentUser === undefined };
};

// --- 3. CORE LOGIC FUNCTIONS (DOCX & PDF GENERATION) ---

const downloadPDF = (element: HTMLElement, title: string) => {
    if (!element) return;
    
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;

    const options = {
        margin: 10,
        filename: fileName,
        image: { type: 'jpeg' as 'jpeg', quality: 0.98 }, 
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    (html2pdf as any)().set(options).from(element).save();
    alert(`Document "${title}" saved as PDF.`);
};

const downloadDOCX = async (contentHTML: string, title: string) => {
    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHTML;
        const textContent = tempDiv.textContent || contentHTML;
        
        const docxContent = textContent.split('\n').map(line => new Paragraph({
            children: [
                new TextRun({
                    text: line,
                }),
            ],
        }));

        const doc = new Document({
            sections: [{
                children: docxContent,
            }],
        });

        const buffer = await Packer.toBlob(doc);
        const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
        saveAs(buffer, fileName);
        alert(`Document "${title}" saved as DOCX. Note: Formatting from the editor may be simplified in DOCX.`);

    } catch (e) {
        console.error("DOCX generation failed:", e);
        alert("Failed to generate DOCX document. Check console for details.");
    }
};


// --- 4. AUTH MODAL COMPONENT (UNCHANGED) ---

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
            onClose();
        } catch (e: any) {
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


// --- SAVE DROPDOWN COMPONENT (CLEANED) ---

const SaveDropdown: React.FC<SaveDropdownProps> = ({ onDownload }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleSelect = (format: 'docx' | 'pdf') => {
        onDownload(format);
        setIsOpen(false);
    };

    return (
        <div className="save-dropdown-container" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="editor-action-btn main-save-btn"
                aria-expanded={isOpen}
            >
                <Save className="icon-xs" style={{marginRight: '8px'}} />
                Save As 
                <ChevronDown className="icon-xs" style={{marginLeft: '4px'}} />
            </button>

            {isOpen && (
                <div className="save-dropdown-menu">
                    <button 
                        onClick={() => handleSelect('pdf')} 
                        className="dropdown-save-item save-pdf"
                    >
                        <File className="icon-xs" style={{marginRight: '8px'}} />
                        PDF Document
                    </button>
                    <button 
                        onClick={() => handleSelect('docx')} 
                        className="dropdown-save-item save-docx"
                    >
                        <FileText className="icon-xs" style={{marginRight: '8px'}} />
                        DOCX Document
                    </button>
                </div>
            )}
        </div>
    );
};


// --- 5. DOCUMENT EDITOR COMPONENT ---

const DocumentEditor: React.FC<DocumentEditorProps> = ({ template, onBack }) => {
    const [content, setContent] = useState(template.initialContent); 
    const contentRef = useRef<HTMLDivElement>(null); 

    const handleFormat = (command: string, value: string = '') => {
        document.execCommand(command, false, value);
        if (contentRef.current) {
            setContent(contentRef.current.innerHTML);
        }
    };

    const handleContentChange = () => {
        if (contentRef.current) {
            setContent(contentRef.current.innerHTML);
        }
    };
    
    const handleDownload = (format: 'docx' | 'pdf') => {
        const element = contentRef.current;

        if (format === 'pdf') {
            if (!element) {
                alert("Document content is not ready for PDF download. Try refreshing.");
                return;
            }
            downloadPDF(element, template.title);
        } else if (format === 'docx') {
            downloadDOCX(content, template.title);
        }
    };

    return (
        <div className="editor-container">
            <div className="editor-title-bar">
                <h2 className="editor-title">Editing: {template.title}</h2>
                <button onClick={onBack} className="editor-action-btn editor-back-btn">
                    &larr; Back to Templates
                </button>
            </div>
            
            <div className="toolbar-container">
                <div className="toolbar-group">
                    <button 
                        onClick={(e) => { e.preventDefault(); handleFormat('bold'); }} 
                        className="editor-action-btn format-btn"
                        title="Bold Selected Text"
                    >
                        <Bold className="icon-xs" />
                    </button>
                    
                    <select 
                        onChange={(e) => {
                            handleFormat('formatBlock', `<${e.target.value}>`);
                        }} 
                        className="editor-select-control"
                        defaultValue="P"
                        title="Change Text Size/Style"
                    >
                        <option value="P">Normal</option>
                        <option value="H1">Heading 1</option>
                        <option value="H2">Heading 2</option>
                        <option value="H3">Heading 3</option>
                    </select>

                </div>
                
                {/* Unified Save Button */}
                <div className="toolbar-group save-group">
                    <SaveDropdown onDownload={handleDownload} />
                </div>
            </div>
            
            <div 
                ref={contentRef} 
                className="rich-text-editor-content"
                contentEditable="true"
                dangerouslySetInnerHTML={{ __html: content }}
                onInput={handleContentChange}
                onBlur={handleContentChange}
            />
            
            <p className="editor-note">
                NOTE: **Select the text first** before clicking the Bold button or changing the style dropdown (Normal/Heading) to apply formatting selectively.
            </p>
        </div>
    );
};


// --- 6. TEMPLATE LIST COMPONENT ---

const TEMPLATES: Template[] = [
    { id: 'app_ltr', title: 'Appointment Letter Template', description: 'Standard format for new staff or faculty.', initialContent: "<p>Dear [Name],</p><p>We are pleased to offer you the position of [Title] at the KIIT Activity Centre...</p>" },
    { id: 'leave_form', title: 'Leave Application Form', description: 'Internal form for staff leave requests.', initialContent: "<p>This is a request for leave from [Date] to [Date]...</p>" },
    { id: 'equip_req', title: 'Equipment Request Form', description: 'Internal form for center supplies.', initialContent: "<p>Item: [Item Name], Quantity: [Number], Justification: [Reason]...</p>" },
];


const TemplateList: React.FC<TemplateListProps> = ({ onSelectTemplate, templates }) => (
    <div className="template-list-panel">
        <h2 className="panel-title">Available Templates</h2>
        <p className="panel-description">
            Select a template below to open the editor, modify the content, and **download** the new document as DOCX or PDF.
        </p>
        
        <div className="template-grid">
            {templates.map((card) => (
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


// --- 7. UI COMPONENTS ---

// Mobile Sidebar Component
const MobileSidebar: React.FC<MobileSidebarProps> = ({ activeView, onSetActiveView, onClose }) => {
    const handleNavigation = (view: 'list' | 'editor' | 'history', action: () => void = () => {}) => {
        onSetActiveView(view);
        action();
        onClose(); 
    };
    
    return (
        <div className="mobile-sidebar-overlay" onClick={onClose}>
            <aside className="mobile-sidebar" onClick={e => e.stopPropagation()}>
                <div className="mobile-sidebar-header">
                    <h2 className="sidebar-title">Navigation</h2>
                    <button onClick={onClose} className="mobile-close-btn">
                        <X className="icon-sm" />
                    </button>
                </div>
                
                <ul className="sidebar-list">
                    <li>
                        <a 
                            href="#" 
                            onClick={() => handleNavigation('list')} 
                            className={`sidebar-link ${activeView === 'list' ? 'active' : ''}`}
                        >
                            <Menu className="icon-xs" style={{marginRight: '12px'}} />
                            Template List
                        </a>
                    </li>
                    <li>
                        <a 
                            href="#" 
                            onClick={() => handleNavigation('history', () => alert("History Disabled"))} 
                            className="sidebar-link disabled"
                        >
                            <Menu className="icon-xs" style={{marginRight: '12px'}} />
                            History Logs (Disabled)
                        </a>
                    </li>
                </ul>
            </aside>
        </div>
    );
};

// Menu Button for Header (Mobile Only)
const MenuButton: React.FC<MenuButtonProps> = ({ onOpen }) => (
    <button onClick={onOpen} className="menu-toggle-btn mobile-only">
        <MenuIcon className="icon-sm" />
    </button>
);


// Header (Updated to include MenuButton)
const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle, user, onSignOut, onLoginClick, isAuthenticated, onMenuOpen, searchQuery, onSearchChange }) => (
    <header className={`app-header ${theme}-theme`}>
        <div className="header-content-wrapper">
            
            <div className="header-left">
                <MenuButton onOpen={onMenuOpen} />
                <div className="app-logo">UC</div>
                <h1 className="app-title">Uni Doc</h1> {/* FIXED: Title changed */}
            </div>

            <div className="header-right">
                <div className="search-container">
                    <input 
                        type="search" 
                        placeholder="Search templates or documents..." 
                        className="search-input"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    <Search className="search-icon" />
                </div>
                
                <ThemeToggle theme={theme} onToggle={onThemeToggle} />
                
                {isAuthenticated ? (
                    <ProfileMenu user={user} onSignOut={onSignOut} onLoginClick={onLoginClick}/>
                ) : (
                    <button onClick={onLoginClick} className="login-signup-btn">
                        Log In / Sign Up
                    </button>
                )}
            </div>
        </div>
    </header>
);

// Footer Component (New)
const Footer: React.FC = () => (
    <footer className="app-footer">
        <p className="footer-text">
            &copy; 2025 Uni Doc. All rights reserved.
        </p>
    </footer>
);

// ProfileMenu component 
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
            <UserAvatar />
            {isOpen && (
                <div onBlur={() => setIsOpen(false)} tabIndex={0} className="profile-dropdown">
                    {user && !user.isAnonymous ? (
                        <div className="dropdown-content">
                            <p className="dropdown-user-welcome">
                                Welcome, {user.email}!
                            </p>
                            <button onClick={() => handleAction('details')} className="dropdown-item">
                                <UserIcon className="icon-xs" style={{marginRight: '8px'}} />
                                View Profile Details
                            </button>
                            <button onClick={() => handleAction('logout')} className="dropdown-item dropdown-logout-btn">
                                <LogOut className="icon-xs" style={{marginRight: '8px'}} />
                                Log Out
                            </button>
                        </div>
                    ) : (
                        <div className="dropdown-content">
                            <button onClick={() => handleAction('login')} className="dropdown-item dropdown-login-btn">
                                <LogIn className="icon-xs" style={{marginRight: '8px'}} />
                                Log In
                            </button>
                            <button onClick={() => handleAction('signup')} className="dropdown-item">
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


// --- 8. MAIN APP COMPONENT ---

type ActiveView = 'list' | 'editor' | 'history'; 

function App() {
    const { auth, currentUser, isLoading } = useFirebase(); 
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [isAuthModalVisible, setIsAuthModalVisible] = useState(false); 
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [activeView, setActiveView] = useState<ActiveView>('list'); 
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null); 
    
    // 🔍 Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredTemplates, setFilteredTemplates] = useState<Template[]>(TEMPLATES);

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setFilteredTemplates(TEMPLATES); 
            return;
        }

        const results = TEMPLATES.filter((template) =>
            template.title.toLowerCase().includes(query.toLowerCase())
        );
        setFilteredTemplates(results);
    };


    useEffect(() => {
        const root = window.document.documentElement;
        const body = window.document.body;
        
        root.classList.remove('dark');
        body.classList.remove('dark');
        root.classList.add('light');
        body.classList.add('light');
        
        if (theme === 'dark') {
            root.classList.add('dark');
            body.classList.add('dark');
        } else {
            root.classList.remove('dark');
            body.classList.remove('dark');
        }
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

    const handleViewHistory = () => {
        alert("Document History functionality has been removed in this version. Documents are downloaded locally.");
        setActiveView('history');
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
                    template={selectedTemplate}
                    onBack={() => setActiveView('list')}
                />
            ) : null;
            break;
        case 'history':
            mainContent = (
                <div className="history-panel">
                    <button onClick={() => setActiveView('list')} className="editor-action-btn editor-back-btn">&larr; Back to Templates</button>
                    <h2 className="panel-title">Document History</h2>
                    <p className="panel-description">
                        **Document history saving has been disabled.** In this version, documents are downloaded directly to your computer as DOCX or PDF files.
                    </p>
                </div>
            );
            break;
        case 'list':
        default:
            mainContent = (
                <TemplateList
                    onSelectTemplate={handleSelectTemplate}
                    templates={filteredTemplates} // Use filtered templates here
                />
            );
            break;
    }

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
                onMenuOpen={() => setIsMobileSidebarOpen(true)}
                searchQuery={searchQuery}
                onSearchChange={handleSearch}
            />
            
            {isMobileSidebarOpen && (
                <MobileSidebar 
                    activeView={activeView}
                    onSetActiveView={setActiveView}
                    onClose={() => setIsMobileSidebarOpen(false)}
                />
            )}

            <AuthModal 
                auth={auth} 
                isVisible={isAuthModalVisible} 
                onClose={() => setIsAuthModalVisible(false)} 
            />

            <main className="main-content-area">
                <div className="main-grid">
                    
                    {/* Desktop Sidebar (Controlled by CSS to hide on mobile) */}
                    <aside className="sidebar desktop-sidebar">
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
                                    History Logs (Disabled)
                                </a>
                            </li>
                        </ul>
                    </aside>

                    <section className="dashboard-panel">
                        {mainContent}
                    </section>
                </div>
            </main>
            
            <Footer />
        </div>
    );
}

export default App;