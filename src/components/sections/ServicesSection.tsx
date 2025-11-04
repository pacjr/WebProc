import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, Users, RefreshCw, Scale, CheckCircle } from "lucide-react";
import calculationsImage from "@/assets/calculations.jpg";

interface ServicesSectionProps {
  onNavigate: (section: string) => void;
}

const ServicesSection = ({ onNavigate }: ServicesSectionProps) => {
  const services = [
    {
      icon: Calculator,
      title: "Cálculos Trabalhistas Judiciais e Extrajudiciais",
      description: "Elaboração de cálculos precisos para ações trabalhistas, acordos, liquidações de sentença e revisões técnicas.",
      features: [
        "Ações trabalhistas",
        "Acordos extrajudiciais",
        "Liquidações de sentença",
        "Revisões técnicas"
      ]
    },
    {
      icon: Scale,
      title: "Perícias Técnicas",
      description: "Atuação como assistente técnico em processos judiciais, com elaboração de pareceres, impugnações e acompanhamento de perícias oficiais.",
      features: [
        "Assistência técnica judicial",
        "Elaboração de pareceres",
        "Impugnações técnicas",
        "Acompanhamento pericial"
      ]
    },
    {
      icon: Users,
      title: "Consultoria para Advogados e Escritórios",
      description: "Apoio técnico especializado para profissionais do Direito, com análise de processos, revisão de cálculos e suporte estratégico.",
      features: [
        "Análise de processos",
        "Suporte estratégico",
        "Consultoria especializada",
        "Apoio técnico contínuo"
      ]
    },
    {
      icon: RefreshCw,
      title: "Revisão e Atualização de Cálculos",
      description: "Verificação de cálculos apresentados em processos, com correções, atualizações e emissão de relatórios detalhados.",
      features: [
        "Verificação técnica",
        "Correções necessárias",
        "Atualizações legais",
        "Relatórios detalhados"
      ]
    }
  ];

  return (
    <section id="servicos" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-primary mb-6">
            Nossos Serviços
          </h2>
          <div className="w-24 h-1 bg-secondary mx-auto mb-8"></div>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Oferecemos soluções completas em cálculos e perícias trabalhistas, 
            com foco na precisão técnica e rigor jurídico.
          </p>
        </div>

        {/* Hero Service Image */}
        <div className="relative mb-16 rounded-lg overflow-hidden shadow-elegant">
          <img 
            src={calculationsImage}
            alt="Profissional realizando cálculos trabalhistas"
            className="w-full h-[300px] object-cover"
          />
          <div className="absolute inset-0 bg-primary/60 flex items-center justify-center">
            <div className="text-center text-primary-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-2xl font-serif font-semibold mb-2">Precisão em Cada Cálculo</h3>
              <p className="text-lg opacity-90">Rigor técnico e atualização constante</p>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {services.map((service, index) => (
            <Card key={index} className="shadow-card hover:shadow-elegant transition-smooth border-border/50 h-full">
              <CardHeader className="pb-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <service.icon className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl font-serif text-primary leading-tight">
                  {service.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {service.description}
                </p>
                <ul className="space-y-2">
                  {service.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <div className="text-center bg-accent/20 py-12 px-8 rounded-lg">
          <h3 className="text-2xl font-serif font-semibold text-primary mb-4">
            Precisa de uma Consultoria Especializada?
          </h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Entre em contato conosco e descubra como podemos auxiliar em seu caso específico 
            com toda a precisão e profissionalismo que você merece.
          </p>
          <Button 
            variant="legal" 
            size="lg"
            onClick={() => onNavigate("contato")}
            className="px-8 py-4"
          >
            Solicitar Orçamento
          </Button>
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;