import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getErrorMessage } from '../../common/utils/error.util';

interface LinketrackEvent {
  data?: string;
  hora?: string;
  local?: string;
  cidade?: string;
  status?: string;
  descricao?: string;
  subStatus?: string[];
}

interface LinketrackResponse {
  erro?: boolean;
  eventos?: LinketrackEvent[];
}

export interface TrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  description: string;
}

export interface TrackingInfo {
  carrier: string;
  trackingCode: string;
  status: string;
  estimatedDelivery?: string;
  events: TrackingEvent[];
  lastUpdate: string;
}

@Injectable()
export class TrackingService {
  /**
   * Rastrear pedido nos Correios
   * API: https://api.linketrack.com (alternativa gratuita)
   * ou https://www.melhorrastreio.com.br/api
   */
  async trackCorreios(trackingCode: string): Promise<TrackingInfo> {
    try {
      // Usando API pública do Melhor Rastreio (exemplo)
      // Em produção, use uma API key válida
      const response = await axios.get<LinketrackResponse>(
        `https://api.linketrack.com/track/json?user=teste&token=1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f&codigo=${trackingCode}`,
      );

      const data = response.data;

      if (!data || data.erro) {
        return {
          carrier: 'correios',
          trackingCode,
          status: 'not_found',
          events: [],
          lastUpdate: new Date().toISOString(),
        };
      }

      const events: TrackingEvent[] = (data.eventos || []).map((evt) => ({
        date: evt.data || '',
        time: evt.hora || '',
        location: evt.local || evt.cidade || 'N/A',
        status: evt.status || '',
        description: evt.descricao || evt.subStatus?.[0] || '',
      }));

      return {
        carrier: 'correios',
        trackingCode,
        status: events[0]?.status || 'unknown',
        events,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Erro ao rastrear Correios:', getErrorMessage(error));
      return {
        carrier: 'correios',
        trackingCode,
        status: 'error',
        events: [],
        lastUpdate: new Date().toISOString(),
      };
    }
  }

  /**
   * Rastrear pedido na Jadlog
   * API: https://www.jadlog.com.br/jadlog/api
   */
  trackJadlog(trackingCode: string): Promise<TrackingInfo> {
    try {
      // Implementação simulada - em produção, use a API real da Jadlog
      // Requer autenticação e credenciais
      return Promise.resolve({
        carrier: 'jadlog',
        trackingCode,
        status: 'in_transit',
        events: [
          {
            date: new Date().toISOString().split('T')[0],
            time: '10:00',
            location: 'Centro de Distribuição - SP',
            status: 'Em trânsito',
            description: 'Objeto em trânsito para unidade de destino',
          },
        ],
        lastUpdate: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Erro ao rastrear Jadlog:', getErrorMessage(error));
      return Promise.resolve({
        carrier: 'jadlog',
        trackingCode,
        status: 'error',
        events: [],
        lastUpdate: new Date().toISOString(),
      });
    }
  }

  /**
   * Rastrear pedido na Total Express
   */
  trackTotalExpress(trackingCode: string): Promise<TrackingInfo> {
    try {
      // Implementação simulada - em produção, use a API real
      return Promise.resolve({
        carrier: 'totalexpress',
        trackingCode,
        status: 'in_transit',
        events: [
          {
            date: new Date().toISOString().split('T')[0],
            time: '14:30',
            location: 'Hub Total Express - RJ',
            status: 'Em trânsito',
            description: 'Mercadoria em transferência',
          },
        ],
        lastUpdate: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Erro ao rastrear Total Express:', getErrorMessage(error));
      return Promise.resolve({
        carrier: 'totalexpress',
        trackingCode,
        status: 'error',
        events: [],
        lastUpdate: new Date().toISOString(),
      });
    }
  }

  /**
   * Método unificado de rastreamento
   */
  async track(carrier: string, trackingCode: string): Promise<TrackingInfo> {
    switch (carrier.toLowerCase()) {
      case 'correios':
      case 'sedex':
      case 'pac':
        return this.trackCorreios(trackingCode);
      case 'jadlog':
        return this.trackJadlog(trackingCode);
      case 'totalexpress':
      case 'total':
        return this.trackTotalExpress(trackingCode);
      default:
        return {
          carrier,
          trackingCode,
          status: 'unsupported_carrier',
          events: [],
          lastUpdate: new Date().toISOString(),
        };
    }
  }

  /**
   * Gerar URL de rastreamento
   */
  getTrackingUrl(carrier: string, trackingCode: string): string {
    const urls: Record<string, string> = {
      correios: `https://rastreamento.correios.com.br/app/index.php?codigo=${trackingCode}`,
      jadlog: `https://www.jadlog.com.br/tracking/rastreamento?codigo=${trackingCode}`,
      totalexpress: `https://www.totalexpress.com.br/rastreie-sua-encomenda/?codigo=${trackingCode}`,
      azulcargo: `https://www.azulcargo.com.br/rastreamento?codigo=${trackingCode}`,
    };

    return urls[carrier.toLowerCase()] || '#';
  }
}
