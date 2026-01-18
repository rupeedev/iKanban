import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Layers,
  GitBranch,
  Users,
  FileText,
  Zap,
  Terminal,
  Keyboard,
  Settings,
  ArrowLeft,
  Sparkles,
  FolderKanban,
  MessageSquare,
  Bot,
} from 'lucide-react';

export function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/projects">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to App
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">Documentation</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 px-4 border-b">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            iKanban Documentation
          </h1>
          <p className="text-lg text-muted-foreground">
            Task management designed for AI coding agents. Orchestrate Claude
            Code, Gemini CLI, Codex, Cursor, and other AI assistants with a
            unified kanban board.
          </p>
        </div>
      </section>

      {/* Quick Navigation */}
      <nav className="py-6 px-4 border-b bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="flex flex-wrap gap-2">
            <a
              href="#getting-started"
              className="text-sm px-3 py-1.5 rounded-full bg-card border hover:bg-accent transition-colors"
            >
              Getting Started
            </a>
            <a
              href="#features"
              className="text-sm px-3 py-1.5 rounded-full bg-card border hover:bg-accent transition-colors"
            >
              Features
            </a>
            <a
              href="#keyboard-shortcuts"
              className="text-sm px-3 py-1.5 rounded-full bg-card border hover:bg-accent transition-colors"
            >
              Keyboard Shortcuts
            </a>
            <a
              href="#mcp-integration"
              className="text-sm px-3 py-1.5 rounded-full bg-card border hover:bg-accent transition-colors"
            >
              MCP Integration
            </a>
            <a
              href="#faq"
              className="text-sm px-3 py-1.5 rounded-full bg-card border hover:bg-accent transition-colors"
            >
              FAQ
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl space-y-16">
          {/* Getting Started */}
          <section id="getting-started">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Getting Started
            </h2>
            <div className="space-y-6">
              <div className="bg-card border rounded-lg p-6">
                <h3 className="font-semibold mb-3">Quick Start with npx</h3>
                <div className="bg-muted rounded-md p-4 font-mono text-sm mb-4">
                  <code>$ npx vibe-kanban</code>
                </div>
                <p className="text-sm text-muted-foreground">
                  No installation required. This command starts a local server
                  and opens iKanban in your browser.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <StepCard
                  number="1"
                  title="Create a Project"
                  description="Start by creating a project. Connect it to a Git repository to enable document sync."
                />
                <StepCard
                  number="2"
                  title="Add Tasks"
                  description="Create tasks on your kanban board. Set priorities, add descriptions, and assign team members."
                />
                <StepCard
                  number="3"
                  title="Execute with AI"
                  description="Use MCP tools to let AI agents pick up tasks, make changes, and update progress automatically."
                />
              </div>
            </div>
          </section>

          {/* Features */}
          <section id="features">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Features
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <FeatureCard
                icon={<FolderKanban className="h-6 w-6" />}
                title="Kanban Board"
                description="Visual task management with drag-and-drop. Track issues through customizable workflow stages: Todo, In Progress, Review, and Done."
              />
              <FeatureCard
                icon={<GitBranch className="h-6 w-6" />}
                title="GitHub Integration"
                description="Connect your GitHub repositories. Sync markdown documents, track issues, and keep everything in sync across your team."
              />
              <FeatureCard
                icon={<Users className="h-6 w-6" />}
                title="Team Collaboration"
                description="Create teams, invite members, and collaborate in real-time. Role-based permissions keep your projects secure."
              />
              <FeatureCard
                icon={<FileText className="h-6 w-6" />}
                title="Document Management"
                description="Create and organize planning documents. Support for markdown editing, PDF uploads, and CSV imports."
              />
              <FeatureCard
                icon={<Bot className="h-6 w-6" />}
                title="AI Agent Support"
                description="Configure multiple AI coding agents including Claude Code, Gemini CLI, Cursor, and custom executors."
              />
              <FeatureCard
                icon={<MessageSquare className="h-6 w-6" />}
                title="Team Chat"
                description="Built-in real-time chat for team communication. Discuss tasks, share updates, and coordinate work."
              />
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section id="keyboard-shortcuts">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Keyboard className="h-6 w-6 text-primary" />
              Keyboard Shortcuts
            </h2>
            <div className="bg-card border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      Shortcut
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <ShortcutRow
                    shortcut="Cmd/Ctrl + K"
                    action="Open command palette / search"
                  />
                  <ShortcutRow
                    shortcut="Cmd/Ctrl + N"
                    action="Create new task"
                  />
                  <ShortcutRow
                    shortcut="Cmd/Ctrl + /"
                    action="Toggle sidebar"
                  />
                  <ShortcutRow shortcut="Cmd/Ctrl + ," action="Open settings" />
                  <ShortcutRow
                    shortcut="Escape"
                    action="Close dialog / deselect"
                  />
                  <ShortcutRow shortcut="?" action="Show keyboard shortcuts" />
                  <ShortcutRow shortcut="G then P" action="Go to Projects" />
                  <ShortcutRow shortcut="G then I" action="Go to Inbox" />
                  <ShortcutRow shortcut="G then M" action="Go to My Issues" />
                </tbody>
              </table>
            </div>
          </section>

          {/* MCP Integration */}
          <section id="mcp-integration">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Terminal className="h-6 w-6 text-primary" />
              MCP Integration
            </h2>
            <div className="space-y-6">
              <p className="text-muted-foreground">
                iKanban supports the Model Context Protocol (MCP) for seamless
                AI agent interaction. Configure MCP servers to let AI assistants
                interact with your tasks programmatically.
              </p>
              <div className="bg-card border rounded-lg p-6 space-y-4">
                <h3 className="font-semibold">Available MCP Tools</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <code className="bg-muted px-2 py-0.5 rounded text-xs">
                      list_tasks
                    </code>
                    <span className="text-muted-foreground">
                      Get all tasks from a project
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <code className="bg-muted px-2 py-0.5 rounded text-xs">
                      create_task
                    </code>
                    <span className="text-muted-foreground">
                      Create a new task with title and description
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <code className="bg-muted px-2 py-0.5 rounded text-xs">
                      update_task
                    </code>
                    <span className="text-muted-foreground">
                      Update task status, priority, or details
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <code className="bg-muted px-2 py-0.5 rounded text-xs">
                      add_comment
                    </code>
                    <span className="text-muted-foreground">
                      Add a comment to a task
                    </span>
                  </li>
                </ul>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm">
                  <strong>Configure MCP:</strong> Go to{' '}
                  <Link
                    to="/settings/mcp"
                    className="text-primary hover:underline"
                  >
                    Settings → MCP
                  </Link>{' '}
                  to manage your MCP server configuration.
                </p>
              </div>
            </div>
          </section>

          {/* Settings Overview */}
          <section id="settings">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Settings className="h-6 w-6 text-primary" />
              Settings & Configuration
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <SettingCard
                title="General Settings"
                description="Theme, language, analytics preferences, and default editor configuration."
                link="/settings/general"
              />
              <SettingCard
                title="Project Settings"
                description="Configure project-specific options, repository connections, and task defaults."
                link="/settings/projects"
              />
              <SettingCard
                title="AI Agents"
                description="Configure AI coding agents like Claude Code, Gemini CLI, and custom executors."
                link="/settings/agents"
              />
              <SettingCard
                title="API Keys"
                description="Manage API keys for AI providers and external integrations."
                link="/settings/api-keys"
              />
            </div>
          </section>

          {/* FAQ */}
          <section id="faq">
            <h2 className="text-2xl font-bold mb-6">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              <FaqItem
                question="Can I self-host iKanban?"
                answer="Yes! iKanban can run locally via npx or be deployed to your own infrastructure using Docker. All data stays on your servers."
              />
              <FaqItem
                question="Which AI agents are supported?"
                answer="iKanban supports Claude Code, Gemini CLI, Codex, Cursor, and custom executors. Configure your preferred agent in Settings → Agents."
              />
              <FaqItem
                question="How does GitHub sync work?"
                answer="Connect your GitHub account to sync markdown documents between iKanban and your repositories. Documents are stored in a configurable directory (default: .vibe-docs)."
              />
              <FaqItem
                question="Is my data secure?"
                answer="Yes. iKanban uses Clerk for authentication, encrypted storage for secrets, and per-team data isolation. When self-hosted, all data remains on your infrastructure."
              />
              <FaqItem
                question="Can I use iKanban offline?"
                answer="iKanban requires a connection to the backend server. For local use, run via npx which starts both frontend and backend locally."
              />
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              iKanban Documentation
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://github.com/rupeedev/iKanban"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/vibe-kanban"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              npm
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="text-primary mb-3">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold mb-3">
        {number}
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  action,
}: {
  shortcut: string;
  action: string;
}) {
  return (
    <tr className="hover:bg-muted/50">
      <td className="px-4 py-2">
        <kbd className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
          {shortcut}
        </kbd>
      </td>
      <td className="px-4 py-2 text-sm text-muted-foreground">{action}</td>
    </tr>
  );
}

function SettingCard({
  title,
  description,
  link,
}: {
  title: string;
  description: string;
  link: string;
}) {
  return (
    <Link to={link} className="block">
      <div className="bg-card border rounded-lg p-4 hover:border-primary transition-colors">
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="font-semibold mb-2">{question}</h3>
      <p className="text-sm text-muted-foreground">{answer}</p>
    </div>
  );
}
