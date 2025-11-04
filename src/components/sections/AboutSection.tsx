import { Card, CardContent } from "@/components/ui/card";
import { Shield, Target, Users, Award } from "lucide-react";
import teamWorking from "@/assets/team-working.jpg";

const AboutSection = () => {
  const values = [
    {
      icon: Shield,
      title: "Ética e Transparência",
      description: "Atuamos sempre com integridade e transparência em todos os nossos processos."
    },
    {
      icon: Target,
      title: "Comprometimento com Resultados",
      description: "Focamos na entrega de resultados precisos e confiáveis para nossos clientes."
    },
    {
      icon: Users,
      title: "Rigor Técnico",
      description: "Mantemos atualização constante e aplicamos o mais alto rigor técnico."
    },
    {
      icon: Award,
      title: "Respeito aos Prazos",
      description: "Cumprimos rigorosamente as normas legais e os prazos processuais."
    }
  ];

  return (
    <section id="sobre" className="py-20 section-gradient">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-primary mb-6">
            Quem Somos
          </h2>
          <div className="w-24 h-1 bg-secondary mx-auto mb-8"></div>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Fundada em Curitiba, Paraná, a Actus Nível nasceu com o propósito de oferecer 
            serviços técnicos de excelência na área trabalhista.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
          {/* Image */}
          <div className="relative">
            <img 
              src={teamWorking} 
              alt="Equipe da Actus Nível trabalhando"
              className="rounded-lg shadow-elegant w-full h-[400px] object-cover"
            />
            <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-primary/20 to-transparent"></div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-serif font-semibold text-primary mb-4">Nossa Missão</h3>
              <p className="text-muted-foreground leading-relaxed">
                Prestar serviços técnicos em cálculos trabalhistas com qualidade, agilidade e 
                responsabilidade, contribuindo para a justiça e a segurança jurídica.
              </p>
            </div>
            
            <div>
              <h3 className="text-2xl font-serif font-semibold text-primary mb-4">Nossa Visão</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ser referência nacional em perícias e cálculos trabalhistas, reconhecida pela 
                confiabilidade e pelo profissionalismo.
              </p>
            </div>

            <div className="bg-accent/30 p-6 rounded-lg">
              <p className="text-primary font-medium italic">
                "Com atuação focada em perícias e cálculos judiciais, nossa empresa se destaca 
                pela precisão, ética e comprometimento com cada cliente."
              </p>
            </div>
          </div>
        </div>

        {/* Values */}
        <div>
          <h3 className="text-3xl font-serif font-semibold text-primary text-center mb-12">
            Nossos Valores
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <Card key={index} className="shadow-card hover:shadow-elegant transition-smooth border-border/50">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <value.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h4 className="text-lg font-semibold text-primary mb-3">{value.title}</h4>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;