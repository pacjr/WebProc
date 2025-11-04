import { useState } from "react";
import HeroSection from "@/components/sections/HeroSection";
import AboutSection from "@/components/sections/AboutSection";
import ServicesSection from "@/components/sections/ServicesSection";
import ContactSection from "@/components/sections/ContactSection";

const Home = () => {
  const [currentSection, setCurrentSection] = useState("home");

  const handleNavigation = (section: string) => {
    setCurrentSection(section);
  };

  return (
    <main>
      <HeroSection onNavigate={handleNavigation} />
      <AboutSection />
      <ServicesSection onNavigate={handleNavigation} />
      <ContactSection />
    </main>
  );
};

export default Home;
