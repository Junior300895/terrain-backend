-- Terrain principal
INSERT IGNORE INTO terrains (nom, description, capacite, prix_par_heure, adresse, actif)
VALUES ('Terrain Principal', 'Terrain de football en gazon synthétique, éclairage LED', 22, 40000.00, 'Dakar, Sénégal', 1);

-- Admin par défaut (mot de passe: Admin@1234)
INSERT IGNORE INTO utilisateurs (nom, prenom, telephone, email, mot_de_passe, role, actif)
VALUES ('Admin', 'Système', '770000000', 'admin@football.sn',
        '$2b$12$ciSXwNlFC/KlFaFbqTHZfO46TFzm/0eSOZfk6ICkwHI1uD3E/rFDq', 'ADMIN', 1);
