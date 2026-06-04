/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface Error {
  /** @example "Hata mesajı burada yazar." */
  error?: string;
}

export interface LoginRequest {
  /** @example "admin@offitec.com" */
  email: string;
  /** @example "123456" */
  password: string;
}

export interface LoginResponse {
  token?: string;
  employee?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    tenantId?: string;
  };
}

export interface TenantCreateRequest {
  /** @example "OFFITEC Merkez" */
  tenantName: string;
  /** @example "Alt şubeyse buraya üst şirketin IDsi yazılır" */
  parentTenantId?: string | null;
}

export interface TenantUpdateRequest {
  /** @example "OFFITEC Yeni İsim" */
  tenantName?: string;
  /** @example false */
  isActive?: boolean;
  parentTenantId?: string | null;
}

export interface TenantResponse {
  id?: string;
  tenantName?: string;
  isActive?: boolean;
  parentTenantId?: string | null;
  /** @format date-time */
  createdAt?: string;
}

export interface CreateEmployeeRequest {
  /** @example "Ahmet" */
  firstName: string;
  /** @example "Yilmaz" */
  lastName: string;
  /**
   * @format email
   * @example "ahmet.yilmaz@offitec.com"
   */
  email: string;
  /** @example "SecurePassword123!" */
  password: string;
  /** @example "Senior Developer" */
  title?: string;
  /** @example "it-dept" */
  departmentId?: string;
  /** @example "Mühendis" */
  roleName?: string;
  /** @example "+90 555 123 4567" */
  phone?: string;
  /** @example "İstanbul, Türkiye" */
  address?: string;
  /**
   * @format date-time
   * @example "2026-01-15T00:00:00Z"
   */
  hireDate?: string;
  /** @example 14 */
  annualLeaveEntitlement?: number;
  /** @example "Personel hakkında not" */
  notes?: string;
}

export interface UpdateEmployeeRequest {
  firstName?: string;
  lastName?: string;
  title?: string;
  departmentId?: string;
  roleName?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
  annualLeaveEntitlement?: number;
  notes?: string;
  /** @format date-time */
  terminationDate?: string;
}

export interface CreateLeaveRequest {
  /** @example "789a1234-b56c-78de-f901-234567890123" */
  leaveTypeId: string;
  /**
   * @format date-time
   * @example "2026-06-01T00:00:00Z"
   */
  startDate: string;
  /**
   * @format date-time
   * @example "2026-06-10T00:00:00Z"
   */
  endDate: string;
  /** @example "Yaz tatili" */
  description?: string | null;
}

export interface EvaluateLeaveRequest {
  /** @example true */
  isapproved: boolean;
}

export interface CreateCustomerRequest {
  /** @example "Tech Corp A.Ş." */
  companyName: string;
  /** @example "Enterprise" */
  segment?: string;
  /** @example "Mecidiyeköy" */
  taxOffice?: string;
  /** @example "1234567890" */
  taxNumber?: string;
  /** @example "Levent, İstanbul" */
  address?: string;
  /** @example "+90 212 123 45 67" */
  mainPhone?: string;
  /**
   * @format email
   * @example "info@techcorp.com"
   */
  mainEmail?: string;
}

export interface AddCustomerNoteRequest {
  /** @example "Müşteri ile SLA sözleşmesi yenilendi." */
  noteText: string;
  /** @example "internal" */
  noteType: "internal" | "technical";
  /**
   * Kritik not vurgulama
   * @example true
   */
  isHighlight?: boolean;
}

import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  HeadersDefaults,
  ResponseType,
} from "axios";
import axios from "axios";

export type QueryParamsType = Record<string | number, any>;

export interface FullRequestParams
  extends Omit<AxiosRequestConfig, "data" | "params" | "url" | "responseType"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseType;
  /** request body */
  body?: unknown;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown>
  extends Omit<AxiosRequestConfig, "data" | "cancelToken"> {
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<AxiosRequestConfig | void> | AxiosRequestConfig | void;
  secure?: boolean;
  format?: ResponseType;
}

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public instance: AxiosInstance;
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private secure?: boolean;
  private format?: ResponseType;

  constructor({
    securityWorker,
    secure,
    format,
    ...axiosConfig
  }: ApiConfig<SecurityDataType> = {}) {
    this.instance = axios.create({
      ...axiosConfig,
      baseURL: axiosConfig.baseURL || "https://demo.offitec.ch/backend/api/v1",
    });
    this.secure = secure;
    this.format = format;
    this.securityWorker = securityWorker;
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected mergeRequestParams(
    params1: AxiosRequestConfig,
    params2?: AxiosRequestConfig,
  ): AxiosRequestConfig {
    const method = params1.method || (params2 && params2.method);

    return {
      ...this.instance.defaults,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...((method &&
          this.instance.defaults.headers[
            method.toLowerCase() as keyof HeadersDefaults
          ]) ||
          {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected stringifyFormItem(formItem: unknown) {
    if (typeof formItem === "object" && formItem !== null) {
      return JSON.stringify(formItem);
    } else {
      return `${formItem}`;
    }
  }

  protected createFormData(input: Record<string, unknown>): FormData {
    if (input instanceof FormData) {
      return input;
    }
    return Object.keys(input || {}).reduce((formData, key) => {
      const property = input[key];
      const propertyContent: any[] =
        property instanceof Array ? property : [property];

      for (const formItem of propertyContent) {
        const isFileType = formItem instanceof Blob || formItem instanceof File;
        formData.append(
          key,
          isFileType ? formItem : this.stringifyFormItem(formItem),
        );
      }

      return formData;
    }, new FormData());
  }

  public request = async <T = any, _E = any>({
    secure,
    path,
    type,
    query,
    format,
    body,
    ...params
  }: FullRequestParams): Promise<AxiosResponse<T>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const responseFormat = format || this.format || undefined;

    if (
      type === ContentType.FormData &&
      body &&
      body !== null &&
      typeof body === "object"
    ) {
      body = this.createFormData(body as Record<string, unknown>);
    }

    if (
      type === ContentType.Text &&
      body &&
      body !== null &&
      typeof body !== "string"
    ) {
      body = JSON.stringify(body);
    }

    return this.instance.request({
      ...requestParams,
      headers: {
        ...(requestParams.headers || {}),
        ...(type ? { "Content-Type": type } : {}),
      },
      params: query,
      responseType: responseFormat,
      data: body,
      url: path,
    });
  };
}

/**
 * @title OFFITEC ERP API
 * @version 1.0.0
 * @baseUrl https://demo.offitec.ch/backend/api/v1
 *
 * OFFITEC Kurumsal ERP Sistemi API Dokümantasyonu
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  attendance = {
    /**
     * No description
     *
     * @tags Attendance
     * @name CheckInCreate
     * @summary Personel giriş kaydı oluştur
     * @request POST:/attendance/check-in
     * @secure
     */
    checkInCreate: (params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/attendance/check-in`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attendance
     * @name CheckOutCreate
     * @summary Personel çıkış kaydı oluştur
     * @request POST:/attendance/check-out
     * @secure
     */
    checkOutCreate: (params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/attendance/check-out`,
        method: "POST",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attendance
     * @name AttendanceList
     * @summary Devam kayıtlarını listele (tarih bazlı)
     * @request GET:/attendance
     * @secure
     */
    attendanceList: (
      query?: {
        /**
         * Tarih filtresi (YYYY-MM-DD)
         * @format date
         */
        date?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/attendance`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Attendance
     * @name AttendancePartialUpdate
     * @summary Devam kaydını manuel düzelt (İK yetkisi)
     * @request PATCH:/attendance/{id}
     * @secure
     */
    attendancePartialUpdate: (
      id: string,
      data: {
        /** @format date-time */
        checkInTime?: string;
        /** @format date-time */
        checkOutTime?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/attendance/${id}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  auth = {
    /**
     * No description
     *
     * @tags Auth
     * @name LoginCreate
     * @summary Kullanıcı girişi (JWT token alır)
     * @request POST:/auth/login
     */
    loginCreate: (data: LoginRequest, params: RequestParams = {}) =>
      this.request<LoginResponse, Error>({
        path: `/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name MePermissionsList
     * @summary Giriş yapan kullanıcının yetkilerini getir
     * @request GET:/auth/me/permissions
     * @secure
     */
    mePermissionsList: (params: RequestParams = {}) =>
      this.request<
        {
          permissions?: string[];
        },
        void
      >({
        path: `/auth/me/permissions`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name GetAuth
     * @summary Giriş yapan kullanıcının bilgilerini getir
     * @request GET:/auth/me
     * @secure
     */
    getAuth: (params: RequestParams = {}) =>
      this.request<any, void>({
        path: `/auth/me`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  customers = {
    /**
     * No description
     *
     * @tags CRM
     * @name CustomersList
     * @summary Müşteri Listesini Getir
     * @request GET:/customers
     * @secure
     */
    customersList: (
      query?: {
        isActive?: boolean;
        segment?: string;
        search?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/customers`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags CRM
     * @name CustomersCreate
     * @summary Yeni Müşteri Oluştur
     * @request POST:/customers
     * @secure
     */
    customersCreate: (
      data: CreateCustomerRequest,
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/customers`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags CRM
     * @name CustomersPartialUpdate
     * @summary Müşteri bilgilerini güncelle
     * @request PATCH:/customers/{id}
     * @secure
     */
    customersPartialUpdate: (
      id: string,
      data: {
        companyName?: string;
        segment?: string;
        taxOffice?: string;
        taxNumber?: string;
        address?: string;
        mainPhone?: string;
        mainEmail?: string;
        isActive?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/customers/${id}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags CRM
     * @name DashboardList
     * @summary Müşteri 360° Genel Bakış Paneli (Dashboard) Getir
     * @request GET:/customers/{id}/dashboard
     * @secure
     */
    dashboardList: (id: string, params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/customers/${id}/dashboard`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags CRM
     * @name NotesCreate
     * @summary Müşteriye Not Ekle
     * @request POST:/customers/{id}/notes
     * @secure
     */
    notesCreate: (
      id: string,
      data: AddCustomerNoteRequest,
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/customers/${id}/notes`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags CRM
     * @name ActivitiesCreate
     * @summary Müşteri Zaman Çizelgesine Aktivite Ekle
     * @request POST:/customers/{id}/activities
     * @secure
     */
    activitiesCreate: (
      id: string,
      data: {
        activityType?: string;
        description?: string;
        /** @format date-time */
        activityDate?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/customers/${id}/activities`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags CRM
     * @name DocumentsCreate
     * @summary Müşteriye Ait Doküman Yükle
     * @request POST:/customers/{id}/documents
     * @secure
     */
    documentsCreate: (
      id: string,
      data: {
        fileName?: string;
        fileUrl?: string;
        fileType?: string;
        category?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/customers/${id}/documents`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  employees = {
    /**
     * No description
     *
     * @tags Employees
     * @name EmployeesCreate
     * @summary Yeni çalışan oluştur
     * @request POST:/employees
     * @secure
     */
    employeesCreate: (
      data: CreateEmployeeRequest,
      params: RequestParams = {},
    ) =>
      this.request<void, Error | void>({
        path: `/employees`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Employees
     * @name EmployeesList
     * @summary Çalışan listesini getir
     * @request GET:/employees
     * @secure
     */
    employeesList: (
      query?: {
        /** Aktif / pasif filtresi */
        isActive?: boolean;
        /** Departman ID */
        departmentId?: string;
        /** Rol filtresi */
        roleName?: string;
        /** Ad/soyad/e-posta arama */
        search?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<object[], void>({
        path: `/employees`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Employees
     * @name EmployeesDetail
     * @summary Personel detayını getir
     * @request GET:/employees/{id}
     * @secure
     */
    employeesDetail: (id: string, params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/employees/${id}`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Employees
     * @name EmployeesPartialUpdate
     * @summary Personel bilgilerini güncelle
     * @request PATCH:/employees/{id}
     * @secure
     */
    employeesPartialUpdate: (
      id: string,
      data: UpdateEmployeeRequest,
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/employees/${id}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  leaves = {
    /**
     * No description
     *
     * @tags Leaves
     * @name TypesList
     * @summary İzin türlerini listele
     * @request GET:/leaves/types
     * @secure
     */
    typesList: (params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/leaves/types`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Leaves
     * @name LeavesList
     * @summary İzin taleplerini listele
     * @request GET:/leaves
     * @secure
     */
    leavesList: (
      query?: {
        /** Durum filtresi (Pending, Approved, Rejected) */
        status?: string;
        /** true ise tüm tenant izinleri, false/yoksa sadece kendi izinleri */
        all?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/leaves`,
        method: "GET",
        query: query,
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Leaves
     * @name LeavesCreate
     * @summary Yeni izin talebi oluştur
     * @request POST:/leaves
     * @secure
     */
    leavesCreate: (data: CreateLeaveRequest, params: RequestParams = {}) =>
      this.request<void, Error | void>({
        path: `/leaves`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Leaves
     * @name EvaluatePartialUpdate
     * @summary İzin talebini onayla veya reddet
     * @request PATCH:/leaves/{id}/evaluate
     * @secure
     */
    evaluatePartialUpdate: (
      id: string,
      data: EvaluateLeaveRequest,
      params: RequestParams = {},
    ) =>
      this.request<void, Error | void>({
        path: `/leaves/${id}/evaluate`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),
  };
  roles = {
    /**
     * No description
     *
     * @tags RBAC
     * @name RolesList
     * @summary Tüm rolleri listele
     * @request GET:/roles
     * @secure
     */
    rolesList: (params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/roles`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags RBAC
     * @name RolesCreate
     * @summary Yeni rol oluştur
     * @request POST:/roles
     * @secure
     */
    rolesCreate: (
      data: {
        roleName?: string;
        permissionIds?: string[];
      },
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/roles`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags RBAC
     * @name PermissionsList
     * @summary Tüm izinleri listele
     * @request GET:/roles/permissions
     * @secure
     */
    permissionsList: (params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/roles/permissions`,
        method: "GET",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags RBAC
     * @name RolesPartialUpdate
     * @summary Rol yetkilerini güncelle
     * @request PATCH:/roles/{id}
     * @secure
     */
    rolesPartialUpdate: (
      id: string,
      data: {
        roleName?: string;
        permissionIds?: string[];
      },
      params: RequestParams = {},
    ) =>
      this.request<void, any>({
        path: `/roles/${id}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        ...params,
      }),

    /**
     * No description
     *
     * @tags RBAC
     * @name RolesDelete
     * @summary Rol sil
     * @request DELETE:/roles/{id}
     * @secure
     */
    rolesDelete: (id: string, params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/roles/${id}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),
  };
  tenants = {
    /**
     * No description
     *
     * @tags Tenants
     * @name TenantsCreate
     * @summary Yeni Şirket (Tenant) veya Şube (Sub-Tenant) oluşturur
     * @request POST:/tenants
     * @secure
     */
    tenantsCreate: (data: TenantCreateRequest, params: RequestParams = {}) =>
      this.request<TenantResponse, Error>({
        path: `/tenants`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Tenants
     * @name TenantsPartialUpdate
     * @summary Şirket / Şube bilgilerini günceller
     * @request PATCH:/tenants/{id}
     * @secure
     */
    tenantsPartialUpdate: (
      id: string,
      data: TenantUpdateRequest,
      params: RequestParams = {},
    ) =>
      this.request<TenantResponse, Error>({
        path: `/tenants/${id}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
}
