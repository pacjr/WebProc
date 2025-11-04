import { Button } from "@/components/ui/button";
import heroOffice from "@/assets/hero-office.jpg";

interface HeroSectionProps {
  onNavigate: (section: string) => void;
}

const HeroSection = ({ onNavigate }: HeroSectionProps) => {
  return (
    <section 
      id="home" 
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${heroOffice})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="absolute inset-0 bg-primary/75"></div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        {/* Logo/Brand */}
        <div className="mb-8">
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-primary-foreground mb-4 [text-shadow:_0_0_20px_hsl(42_100%_50%_/_0.3),_0_0_40px_hsl(42_100%_50%_/_0.2)]">
            Actus Nível
          </h1>
        </div>
        
        {/* Main Heading */}
        <h2 className="text-2xl md:text-4xl font-serif text-primary-foreground mb-6 leading-tight [text-shadow:_0_0_15px_hsl(42_100%_50%_/_0.25),_0_0_30px_hsl(42_100%_50%_/_0.15)]">
          Especialistas em perícias e cálculos trabalhistas com precisão e ética
        </h2>
        
        {/* Description */}
        <p className="text-lg md:text-xl text-primary-foreground/90 mb-8 leading-relaxed max-w-2xl mx-auto [text-shadow:_0_0_10px_hsl(42_100%_50%_/_0.2)]">
          Oferecemos soluções técnicas especializadas em perícias e cálculos trabalhistas, 
          com foco na confiabilidade e no rigor jurídico.
        </p>
        
        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button 
            variant="hero" 
            size="lg"
            onClick={() => onNavigate("servicos")}
            className="px-8 py-4 text-lg"
          >
            Nossos Serviços
          </Button>
          <Button 
            variant="hero" 
            size="lg"
            onClick={() => onNavigate("contato")}
            className="px-8 py-4 text-lg"
          >
            Fale Conosco
          </Button>
        </div>
      </div>
      
      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex flex-col items-center text-primary-foreground/70">
          <span className="text-sm mb-2">Role para saber mais</span>
          <div className="w-6 h-10 border-2 border-primary-foreground/50 rounded-full flex justify-center">
            <div className="w-1 h-3 bg-primary-foreground/50 rounded-full mt-2 animate-bounce"></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;