import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavigationProps {
  currentSection?: string;
  onSectionChange?: (section: string) => void;
}

const Navigation = ({ currentSection, onSectionChange }: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuItems = [
    { id: "home", label: "Home" },
    { id: "sobre", label: "Quem Somos" },
    { id: "servicos", label: "Serviços" },
    { id: "contato", label: "Contato" },
  ];

  const handleClientAreaClick = () => {
    window.location.href = "/auth";
  };

  const handleNavigation = (sectionId: string) => {
    onSectionChange?.(sectionId);
    setIsMenuOpen(false);
    
    // Scroll to section
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border shadow-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <h2 className="text-2xl font-serif font-bold text-primary">
              Actus Nível
            </h2>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.id)}
                className={`text-sm font-medium transition-smooth hover:text-primary ${
                  currentSection === item.id
                    ? "text-primary border-b-2 border-primary pb-1"
                    : "text-muted-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => handleNavigation("contato")}>
              Fale Conosco
            </Button>
            <Button variant="legal" size="sm" onClick={handleClientAreaClick}>
              Área do Cliente
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 bg-card border-t border-border">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.id)}
                  className={`block w-full text-left px-3 py-2 rounded-md text-base font-medium transition-smooth ${
                    currentSection === item.id
                      ? "text-primary bg-accent"
                      : "text-muted-foreground hover:text-primary hover:bg-accent"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <div className="pt-2 space-y-2">
                <div className="flex justify-center py-2">
                  <ThemeToggle />
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => handleNavigation("contato")}
                >
                  Fale Conosco
                </Button>
                <Button 
                  variant="legal" 
                  size="sm" 
                  className="w-full"
                  onClick={handleClientAreaClick}
                >
                  Área do Cliente
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;