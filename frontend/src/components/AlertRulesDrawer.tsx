import { Drawer, Form, Input, Select, InputNumber, Button, List, Tag, Space } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useSimStore, AlertRule } from '../store/simStore'

interface Props {
  open: boolean
  onClose: () => void
}

const OPERATORS = ['>', '<', '>=', '<='] as const

export default function AlertRulesDrawer({ open, onClose }: Props) {
  const { alertRules, addAlertRule, removeAlertRule } = useSimStore()
  const [form] = Form.useForm()

  const handleAdd = (values: { kpiKey: string; operator: AlertRule['operator']; threshold: number; label: string }) => {
    addAlertRule({ ...values, id: crypto.randomUUID() })
    form.resetFields()
  }

  return (
    <Drawer title="KPI Alert Rules" open={open} onClose={onClose} width={380}>
      <Form form={form} layout="vertical" onFinish={handleAdd}>
        <Form.Item name="label" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. High utilization" />
        </Form.Item>
        <Form.Item name="kpiKey" label="KPI Key" rules={[{ required: true }]}>
          <Input placeholder="e.g. utilizationS1" />
        </Form.Item>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Form.Item name="operator" noStyle initialValue=">">
            <Select style={{ width: 80 }}>
              {OPERATORS.map(op => <Select.Option key={op} value={op}>{op}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="threshold" noStyle rules={[{ required: true }]}>
            <InputNumber placeholder="0.8" style={{ width: '100%' }} step={0.01} />
          </Form.Item>
        </Space.Compact>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>
          Add Rule
        </Button>
      </Form>

      <List
        style={{ marginTop: 24 }}
        dataSource={alertRules}
        renderItem={(rule) => (
          <List.Item
            actions={[
              <Button
                key="del"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeAlertRule(rule.id)}
              />,
            ]}
          >
            <Tag color="blue">{rule.kpiKey}</Tag>
            <span>{rule.operator} {rule.threshold}</span>
            <span style={{ marginLeft: 8, color: '#666' }}>{rule.label}</span>
          </List.Item>
        )}
      />
    </Drawer>
  )
}
