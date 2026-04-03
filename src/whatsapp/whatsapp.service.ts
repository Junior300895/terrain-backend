import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

/**
 * WhatsApp Business Cloud API (Meta)
 *
 * Prérequis :
 *  1. Créer une app Meta Developers : https://developers.facebook.com
 *  2. Activer le produit "WhatsApp Business"
 *  3. Récupérer : WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
 *  4. Créer un template de message approuvé nommé "confirmation_reservation"
 *
 * Variables .env requises :
 *  WHATSAPP_TOKEN=EAAxxxxxxx   (token d'accès permanent ou temporaire)
 *  WHATSAPP_PHONE_ID=1234567890  (Phone Number ID dans Meta Business)
 *  WHATSAPP_ENABLED=true
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private config: ConfigService) {}

  async envoyerConfirmationReservation(params: {
    telephone: string;
    clientPrenom: string;
    codeConfirmation: string;
    dateHeure: string;       // ex: "Lundi 30 mars à 10h00"
    montant: string;         // ex: "40 000"
    nomTerrain: string;
  }): Promise<boolean> {
    const enabled = this.config.get('WHATSAPP_ENABLED', 'false');
    if (enabled !== 'true') {
      this.logger.log('WhatsApp désactivé — notification ignorée pour ' + params.telephone);
      return false;
    }

    const token   = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_ID');

    if (!token || !phoneId) {
      this.logger.warn('WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID manquant dans .env');
      return false;
    }

    // Formater le numéro : retirer les espaces et s'assurer qu'il commence par l'indicatif pays
    // Sénégal : +221XXXXXXXXX → 221XXXXXXXXX
    const numero = this.formaterNumero(params.telephone);
    if (!numero) {
      this.logger.warn('Numéro invalide : ' + params.telephone);
      return false;
    }

    // Corps du message — utilise un template WhatsApp approuvé
    // Le template doit être créé dans Meta Business Manager
    // et nommé "confirmation_reservation" avec les variables {{1}}...{{5}}
    const body = {
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: 'confirmation_reservation',
        language: { code: 'fr' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: params.clientPrenom },        // {{1}}
              { type: 'text', text: params.codeConfirmation },    // {{2}}
              { type: 'text', text: params.nomTerrain },          // {{3}}
              { type: 'text', text: params.dateHeure },           // {{4}}
              { type: 'text', text: params.montant + ' FCFA' },   // {{5}}
            ],
          },
        ],
      },
    };

    try {
      await this.post(
        'https://graph.facebook.com/v19.0/' + phoneId + '/messages',
        body,
        token,
      );
      this.logger.log('WhatsApp envoyé à ' + numero + ' — ' + params.codeConfirmation);
      return true;
    } catch (err) {
      this.logger.error('Erreur WhatsApp : ' + err.message);
      return false;
    }
  }

  // Envoi d'un message texte simple (pour tests ou messages libres)
  async envoyerMessage(telephone: string, message: string): Promise<boolean> {
    const enabled = this.config.get('WHATSAPP_ENABLED', 'false');
    if (enabled !== 'true') return false;

    const token   = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_ID');
    if (!token || !phoneId) return false;

    const numero = this.formaterNumero(telephone);
    if (!numero) return false;

    const body = {
      messaging_product: 'whatsapp',
      to: numero,
      type: 'text',
      text: { body: message },
    };

    try {
      await this.post(
        'https://graph.facebook.com/v19.0/' + phoneId + '/messages',
        body,
        token,
      );
      return true;
    } catch (err) {
      this.logger.error('Erreur WhatsApp message : ' + err.message);
      return false;
    }
  }

  // Formater le numéro en format international sans le +
  private formaterNumero(telephone: string): string | null {
    let num = telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (num.startsWith('+')) num = num.slice(1);
    // Numéro sénégalais sans indicatif (9 chiffres → ajouter 221)
    if (num.length === 9) num = '221' + num;
    // Vérifier format valide (7 à 15 chiffres)
    if (!/^\d{7,15}$/.test(num)) return null;
    return num;
  }

  private post(url: string, body: object, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'Content-Length': Buffer.byteLength(data),
        },
      };
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(responseData));
          } else {
            reject(new Error('HTTP ' + res.statusCode + ' : ' + responseData));
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}
