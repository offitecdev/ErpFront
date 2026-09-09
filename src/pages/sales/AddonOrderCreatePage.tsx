import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { addonCreatePath, addonEditPath } from '@/components/orders/addonEditorRoute';

export const AddonOrderCreatePage = () => {
    const { id } = useParams();
    const [params] = useSearchParams();
    const from = params.get('from') || '/sales/addon-orders';
    const parent = params.get('parent');
    return <Navigate replace to={id ? addonEditPath(id, from) : addonCreatePath(parent ? { id: parent, orderNumber: params.get('parentNumber') || '' } : null, from)} />;
};
