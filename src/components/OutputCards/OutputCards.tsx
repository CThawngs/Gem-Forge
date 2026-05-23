import { useState } from 'react';
import { Gem, Copy, Check, Tag, FileText, BookOpen, Wrench, Library, Sparkles } from 'lucide-react';
import { useApp } from '../../hooks/useApp';
import RevisionChat from '../RevisionChat/RevisionChat';
import './OutputCards.css';

type TabId = 'name' | 'description' | 'instructions' | 'tools' | 'knowledge';

const TABS: { id: TabId; icon: typeof Tag; labelKey: string }[] = [
  { id: 'name',         icon: Tag,      labelKey: 'tab_name' },
  { id: 'description',  icon: FileText, labelKey: 'tab_description' },
  { id: 'instructions', icon: BookOpen, labelKey: 'tab_instructions' },
  { id: 'tools',        icon: Wrench,   labelKey: 'tab_tools' },
  { id: 'knowledge',    icon: Library,  labelKey: 'tab_knowledge' },
];

const REVISION_TABS = new Set<TabId>(['description', 'instructions']);

export default function OutputCards() {
  const { t, output, setOutput, user } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('name');
  const [copied, setCopied] = useState(false);
  const [isRevisionPending, setIsRevisionPending] = useState(false);

  const [localContent, setLocalContent] = useState<Record<string, string>>({});
  const [prevOutput, setPrevOutput] = useState(output);

  if (output !== prevOutput) {
    const isNewGem = !prevOutput || !output || (prevOutput as any).id !== (output as any).id;
    setPrevOutput(output);
    setLocalContent({});
    setIsRevisionPending(false);
    if (isNewGem) {
      setActiveTab('name');
    }
  }

  const hasKnowledgeBase = !!output?.knowledgeBase && output.knowledgeBase.length > 0;
  const visibleTabs = TABS.filter((tab) => tab.id !== 'knowledge' || hasKnowledgeBase);

  const getTabContent = (tabId: TabId): string => {
    if (!output) return '';
    if (localContent[tabId] !== undefined) return localContent[tabId];
    switch (tabId) {
      case 'name':         return output.name;
      case 'description':  return output.description;
      case 'instructions': return output.instructions;
      case 'tools':        return output.tools;
      case 'knowledge':    return output.knowledgeBase?.map(kb => `${kb.title} - ${kb.url}`).join('\n') ?? '';
      default:             return '';
    }
  };

  const handleContentUpdate = (tabId: TabId, newContent: string) => {
    setLocalContent((prev) => ({ ...prev, [tabId]: newContent }));
    // Also push update back to global output if needed
    if (output && setOutput) {
      const updated = { ...output };
      switch (tabId) {
        case 'description':  updated.description  = newContent; break;
        case 'instructions': updated.instructions = newContent; break;
      }
      setOutput(updated);
    }
  };

  const handleCopy = () => {
    const content = getTabContent(activeTab);
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleConvertGemini = () => {
    if (!output) return;

    // 1. Save data to localStorage
    const payload = {
      name: output.name || '',
      description: output.description || '',
      instructions: output.instructions || '',
      tools: output.tools || '',
      timestamp: Date.now()
    };
    localStorage.setItem('gemforge_output', JSON.stringify(payload));

    const dataStr = encodeURIComponent(JSON.stringify(payload));

    // 2. Detect device platform
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isAndroid = /android/i.test(userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

    if (isAndroid) {
      // Android Intent scheme to open Gemini app
      window.location.href = `intent://gemini.google.com/gem/create#gemforge_data=${dataStr}#Intent;scheme=https;package=com.google.android.apps.bard;end`;
    } else if (isIOS) {
      // iOS Custom Scheme to open Gemini app
      const fallbackUrl = 'https://apps.apple.com/app/google-gemini/id6503318242';
      window.location.href = `googlegemini://gem/create#gemforge_data=${dataStr}`;
      
      // Fallback redirect after 1.5s
      setTimeout(() => {
        if (!document.hidden) {
          window.location.href = fallbackUrl;
        }
      }, 1500);
    } else {
      // Desktop - open in a new tab with data in hash
      window.open(`https://gemini.google.com/gem/create#gemforge_data=${dataStr}`, '_blank');
    }
  };

  if (!user) return null;

  // Render empty state
  if (!output) {
    return (
      <section className="results" id="results-section">
        <div className="container">
          <div className="results-empty glass-card">
            <div className="results-empty-icon">
              <Gem size={32} />
            </div>
            <h3 className="results-empty-title">{t('results_empty_title')}</h3>
            <p className="results-empty-sub">{t('results_empty_sub')}</p>
          </div>
        </div>
      </section>
    );
  }

  const content = getTabContent(activeTab);

  return (
    <section className="results" id="results-section">
      <div className="container">
        <div className="results-card glass-card">

          {/* Results header */}
          <div className="results-card-header">
            <div className="results-card-title-row">
              <Gem size={18} className="results-header-icon" />
              <h2 className="results-card-title">{t('results_title')}</h2>
            </div>
            {hasKnowledgeBase && (
              <span className="results-kb-badge">
                <Library size={12} />
                {t('results_kb_detected')}
              </span>
            )}
          </div>

          {/* Tab bar */}
          <div className="results-tabs" role="tablist">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`results-tab ${activeTab === tab.id ? 'results-tab--active' : ''} ${
                  tab.id === 'knowledge' ? 'results-tab--kb' : ''
                }`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsRevisionPending(false);
                }}
              >
                <tab.icon size={13} />
                {t(tab.labelKey as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="results-tab-body" role="tabpanel">
            <div className="results-tab-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
              {/* Convert Gemini Gem button (Ultra Only) */}
              {user.plan === 'ultra' && (
                <button
                  id="convert-gemini-btn"
                  className="btn btn-accent"
                  data-payload={JSON.stringify({
                    name: output.name || '',
                    description: output.description || '',
                    instructions: output.instructions || '',
                    tools: output.tools || '',
                    timestamp: Date.now()
                  })}
                  style={{ fontSize: '0.8125rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={handleConvertGemini}
                >
                  <Sparkles size={12} />
                  {t('results_convert_gemini')}
                </button>
              )}
              
              {/* Copy button - in EVERY tab */}
              <button className="results-copy-btn" onClick={handleCopy}>
                {copied
                  ? <><Check size={12} /> {t('results_copied')}</>
                  : <><Copy size={12} /> {t('results_copy')}</>
                }
              </button>
            </div>

            {/* Knowledge Base special layout */}
            {activeTab === 'knowledge' && output.knowledgeBase ? (
              <div className="results-kb-section">
                <p className="results-kb-hint">{t('results_kb_hint')}</p>
                <ul className="results-kb-list">
                  {output.knowledgeBase.map((item, i) => (
                    <li key={i} className="results-kb-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Library size={14} className="results-kb-item-icon" />
                        <span>{item.title}</span>
                      </div>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>
                        {t('kb_open_link')}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : activeTab === 'instructions' || activeTab === 'description' ? (
              !isRevisionPending && (
                <div className="results-content results-content--markdown">
                  {content.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) return <h3 key={i} style={{ marginTop: i === 0 ? 0 : '24px', marginBottom: '12px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{line.replace('## ', '').replace(/\*\*/g, '')}</h3>;
                    if (line.startsWith('- ')) {
                      const text = line.replace('- ', '');
                      const parts = text.split(/\*\*(.*?)\*\*/g);
                      return (
                        <li key={i} style={{ marginLeft: 20, marginBottom: '6px', lineHeight: 1.6 }}>
                          {parts.length > 1 
                            ? parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part))
                            : text}
                        </li>
                      );
                    }
                    if (line.trim() === '---') return <hr key={i} style={{ margin: '24px 0', border: 'none', borderTop: '1px solid var(--border)' }} />;
                    if (line.trim() === '') return <div key={i} style={{ height: '8px' }} />;
                    
                    const parts = line.split(/\*\*(.*?)\*\*/g);
                    return (
                      <p key={i} style={{ marginBottom: '12px', lineHeight: 1.6 }}>
                        {parts.length > 1 
                          ? parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part))
                          : line}
                      </p>
                    );
                  })}
                </div>
              )
            ) : (
              <pre className="results-content">{content}</pre>
            )}

            {/* AI Revision Chat — only for description and instructions tabs */}
            {REVISION_TABS.has(activeTab) && (
              <RevisionChat
                key={activeTab}
                tabId={activeTab}
                tabContent={content}
                onContentUpdate={(newContent) => handleContentUpdate(activeTab, newContent)}
                onPendingChange={setIsRevisionPending}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
