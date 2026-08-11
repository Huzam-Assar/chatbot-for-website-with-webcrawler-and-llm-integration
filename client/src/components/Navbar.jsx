export default function Navbar() {
  return (
    <header className="border-b border-slate-200 bg-white/75 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-lg font-semibold tracking-wide text-slate-900">IntelliFlick</p>
          <p className="text-sm text-slate-500">Simple chatbot demo</p>
        </div>
        <nav className="flex gap-6 text-sm font-medium text-slate-600">
          <a href="#home" className="hover:text-slate-900">
            Home
          </a>
          <a href="#about" className="hover:text-slate-900">
            About
          </a>
        </nav>
      </div>
    </header>
  );
}
