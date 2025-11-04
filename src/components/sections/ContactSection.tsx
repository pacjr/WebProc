import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ContactSection = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    assunto: "",
    mensagem: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simulate form submission
    toast({
      title: "Mensagem enviada!",
      description: "Entraremos em contato em breve. Obrigado!",
    });
    
    // Reset form
    setFormData({
      nome: "",
      email: "",
      telefone: "",
      assunto: "",
      mensagem: ""
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const contactInfo = [
    {
      icon: MapPin,
      title: "Endereço",
      content: ["Av. Mal. Floriano Peixoto, 228 – Conj. 604", "Curitiba – PR | CEP 80010-130"]
    },
    {
      icon: Phone,
      title: "Telefone / WhatsApp",
      content: ["(41) 99999-9999"]
    },
    {
      icon: Mail,
      title: "E-mail",
      content: ["contato@actusnivel.com.br"]
    },
    {
      icon: Clock,
      title: "Horário de Atendimento",
      content: ["Segunda a sexta", "Das 9h às 18h"]
    }
  ];

  return (
    <section id="contato" className="py-20 section-gradient">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-primary mb-6">
            Entre em Contato
          </h2>
          <div className="w-24 h-1 bg-secondary mx-auto mb-8"></div>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Estamos prontos para atender você com agilidade e profissionalismo. 
            Solicite um orçamento ou tire suas dúvidas conosco.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <Card className="shadow-elegant border-border/50">
            <CardHeader>
              <CardTitle className="text-2xl font-serif text-primary">
                Envie sua Mensagem
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Nome Completo *
                    </label>
                    <Input
                      name="nome"
                      value={formData.nome}
                      onChange={handleInputChange}
                      placeholder="Seu nome completo"
                      required
                      className="transition-smooth"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Telefone *
                    </label>
                    <Input
                      name="telefone"
                      value={formData.telefone}
                      onChange={handleInputChange}
                      placeholder="(41) 99999-9999"
                      required
                      className="transition-smooth"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    E-mail *
                  </label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="seu@email.com"
                    required
                    className="transition-smooth"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Assunto *
                  </label>
                  <Input
                    name="assunto"
                    value={formData.assunto}
                    onChange={handleInputChange}
                    placeholder="Ex: Consultoria em cálculos trabalhistas"
                    required
                    className="transition-smooth"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Mensagem *
                  </label>
                  <Textarea
                    name="mensagem"
                    value={formData.mensagem}
                    onChange={handleInputChange}
                    placeholder="Descreva brevemente como podemos ajudá-lo..."
                    className="min-h-[120px] transition-smooth"
                    required
                  />
                </div>
                
                <Button 
                  type="submit" 
                  variant="legal" 
                  size="lg"
                  className="w-full"
                >
                  Enviar Mensagem
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <div className="space-y-6">
            <div className="mb-8">
              <h3 className="text-2xl font-serif font-semibold text-primary mb-4">
                Informações de Contato
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Nossa equipe está pronta para oferecer o suporte técnico especializado 
                que você precisa. Entre em contato pelos canais abaixo.
              </p>
            </div>

            <div className="grid gap-6">
              {contactInfo.map((info, index) => (
                <Card key={index} className="shadow-card hover:shadow-elegant transition-smooth border-border/50">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <info.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-primary mb-2">{info.title}</h4>
                        {info.content.map((line, lineIndex) => (
                          <p key={lineIndex} className="text-muted-foreground text-sm">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Location Highlight */}
            <Card className="shadow-card border-primary/20 bg-primary/5">
              <CardContent className="p-6 text-center">
                <MapPin className="h-8 w-8 text-primary mx-auto mb-3" />
                <h4 className="font-serif font-semibold text-primary mb-2">
                  Localização Estratégica
                </h4>
                <p className="text-sm text-muted-foreground">
                  Situados no centro de Curitiba, oferecemos fácil acesso 
                  para reuniões presenciais quando necessário.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;