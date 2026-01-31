import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CdekProxyService } from './cdek.service';

@Controller('cdek')
export class CdekController {
  constructor(private readonly cdek: CdekProxyService) {}

  @Post('orders')
  async createOrder(
    @Body() body: Record<string, unknown>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.cdek.post('/orders', body, {
      'Idempotency-Key': idempotencyKey,
      'x-request-id': requestId,
    });
    res.status(result.status);
    return result.data;
  }

  @Get('orders/:uuid')
  async getOrderByUuid(@Param('uuid') uuid: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.cdek.get(`/orders/${uuid}`);
    res.status(result.status);
    return result.data;
  }

  @Get('orders/:uuid/barcodes')
  async downloadBarcodes(
    @Param('uuid') uuid: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const params = format ? { format } : undefined;
    const result = await this.cdek.getBinary(`/orders/${uuid}/barcodes`, params);

    if (result.status !== 200) {
      const payload = Buffer.isBuffer(result.data)
        ? result.data.toString('utf8')
        : result.data;
      res.status(result.status);
      try {
        return res.json(typeof payload === 'string' ? JSON.parse(payload) : payload);
      } catch {
        return res.send(payload);
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cdek-barcode-${uuid}.pdf"`,
    );
    res.status(result.status);
    return res.send(result.data);
  }

  @Get('orders')
  async getOrderByNumber(
    @Query('number') number: string,
    @Query('dealId') dealId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const query = dealId ? { dealId } : { number };
    const result = await this.cdek.get('/orders', query);
    res.status(result.status);
    return result.data;
  }

  @Get('locations/suggest/cities')
  async suggestCities(@Query() query: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    const result = await this.cdek.get('/locations/suggest/cities', query);
    res.status(result.status);
    return result.data;
  }

  @Get('locations/regions')
  async getRegions(@Query() query: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    const result = await this.cdek.get('/locations/regions', query);
    res.status(result.status);
    return result.data;
  }

  @Get('locations/postalcodes')
  async getPostalcodes(@Query() query: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    const result = await this.cdek.get('/locations/postalcodes', query);
    res.status(result.status);
    return result.data;
  }

  @Get('locations/coordinates')
  async getCoordinates(@Query() query: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    const result = await this.cdek.get('/locations/coordinates', query);
    res.status(result.status);
    return result.data;
  }

  @Get('locations/cities')
  async getCities(@Query() query: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    const result = await this.cdek.get('/locations/cities', query);
    res.status(result.status);
    return result.data;
  }

  @Get('locations/deliverypoints')
  async getDeliveryPoints(@Query() query: Record<string, any>, @Res({ passthrough: true }) res: Response) {
    const result = await this.cdek.get('/locations/deliverypoints', query);
    res.status(result.status);
    return result.data;
  }

  @Post('calculator/tarifflist')
  async calculateTariffList(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.cdek.post('/calculator/tarifflist', body);
    res.status(result.status);
    return result.data;
  }

  @Post('calculator/tariff')
  async calculateTariff(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.cdek.post('/calculator/tariff', body);
    res.status(result.status);
    return result.data;
  }

  @Post('calculator/tariffAndService')
  async calculateTariffAndService(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.cdek.post('/calculator/tariffAndService', body);
    res.status(result.status);
    return result.data;
  }

  @Get('calculator/alltariffs')
  async getAllTariffs(
    @Headers('x-user-lang') lang: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.cdek.get('/calculator/alltariffs', undefined, {
      'X-User-Lang': lang,
    });
    res.status(result.status);
    return result.data;
  }

  @Post('international/package/restrictions')
  async getInternationalRestrictions(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.cdek.post('/international/package/restrictions', body);
    res.status(result.status);
    return result.data;
  }
}
