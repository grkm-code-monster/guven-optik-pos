import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRouter from './modules/auth/auth.controller';
import shiftsRouter from './modules/shifts/shift.controller';
import customersRouter from './modules/customers/customer.controller';
import productsRouter from './modules/products/product.controller';
import salesRouter from './modules/sales/sale.controller';
import cashMovementsRouter from './modules/cashMovements/cashMovement.controller';
import reportsRouter from './modules/reports/report.controller';
import adminRouter from './modules/admin/admin.controller';
import odooRouter from './modules/odoo/odoo.controller';
import transferRouter from './modules/transfer/transfer.controller';
import expenseRouter from './modules/expenses/expense.controller';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRouter);
  app.use('/api/shifts', shiftsRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/cash-movements', cashMovementsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/odoo', odooRouter);
  app.use('/api/transfer', transferRouter);
  app.use('/api/expenses', expenseRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Kaynak bulunamadı.',
    });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Beklenmeyen bir hata oluştu.',
    });
  });

  return app;
}
